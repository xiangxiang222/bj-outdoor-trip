const crypto = require("crypto");
const { getDb } = require("../db");
const config = require("../config");

function buildCancelSms({ title, date, reason, refunded }) {
  const refundBit = refunded ? "已支付费用将原路退回。" : "报名已取消，无需退款。";
  return `【同行者众】您报名的「${title}」${date}已解散。原因：${reason}。${refundBit}`;
}

function sendSms({ phone, scene, content, refType, refId }) {
  const db = getDb();
  const valid = /^1\d{10}$/.test(phone || "");
  const status = valid ? "sent" : "skipped";
  db.prepare(
    `INSERT INTO sms_logs (phone,scene,content,status,ref_type,ref_id) VALUES (?,?,?,?,?,?)`
  ).run(phone || "", scene || "", content || "", status, refType || "", refId || 0);
  return { mock: true, phone, content, status };
}

function smsSettings(opts = {}) {
  return {
    secretId: opts.secretId != null ? opts.secretId : config.sms.secretId,
    secretKey: opts.secretKey != null ? opts.secretKey : config.sms.secretKey,
    sdkAppId: opts.sdkAppId != null ? opts.sdkAppId : config.sms.sdkAppId,
    signName: opts.signName != null ? opts.signName : config.sms.signName,
    templateId: opts.templateId != null ? opts.templateId : config.sms.templateId,
    region: opts.region || config.sms.region || "ap-guangzhou",
  };
}

function smsLive(opts = {}) {
  const sms = smsSettings(opts);
  return Boolean(sms.secretId && sms.secretKey && sms.sdkAppId && sms.signName && sms.templateId);
}

function sha256hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function tc3Authorization({ secretId, secretKey, service, host, action, payload, timestamp }) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const contentType = "application/json; charset=utf-8";
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:${String(action).toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, sha256hex(payload)].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = ["TC3-HMAC-SHA256", String(timestamp), credentialScope, sha256hex(canonicalRequest)].join("\n");
  const signing = hmac(hmac(hmac(`TC3${secretKey}`, date), service), "tc3_request");
  const signature = crypto.createHmac("sha256", signing).update(stringToSign).digest("hex");
  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function randomSmsCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

async function sendVerifySms({ phone, code, secretId, secretKey, sdkAppId, signName, templateId, region, timestamp, fetchImpl }) {
  const host = "sms.tencentcloudapi.com";
  const payload = JSON.stringify({
    PhoneNumberSet: [`+86${phone}`],
    SmsSdkAppId: String(sdkAppId),
    SignName: signName,
    TemplateId: String(templateId),
    TemplateParamSet: [String(code)],
  });
  const now = timestamp || Math.floor(Date.now() / 1000);
  const authorization = tc3Authorization({
    secretId,
    secretKey,
    service: "sms",
    host,
    action: "SendSms",
    payload,
    timestamp: now,
  });
  const res = await (fetchImpl || fetch)(`https://${host}/`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: host,
      "X-TC-Action": "SendSms",
      "X-TC-Timestamp": String(now),
      "X-TC-Version": "2021-01-11",
      "X-TC-Region": region || "ap-guangzhou",
    },
    body: payload,
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  const status = data.Response && data.Response.SendStatusSet && data.Response.SendStatusSet[0];
  if (data.Response && data.Response.Error) fail(400, "短信发送失败");
  if (!status || status.Code !== "Ok") fail(400, "短信发送失败");
  return data;
}

async function issueSmsCode(phone, scene, opts = {}) {
  const mobile = String(phone || "");
  const use = scene || "login";
  if (!/^1\d{10}$/.test(mobile)) fail(400, "手机号不正确");
  const db = getDb();
  const recent = db
    .prepare(
      "SELECT id FROM sms_codes WHERE phone=? AND scene=? AND created_at>=datetime('now','localtime','-60 seconds') ORDER BY id DESC LIMIT 1"
    )
    .get(mobile, use);
  if (recent) fail(400, "请稍后再获取验证码");
  const sms = smsSettings(opts);
  const live = smsLive(sms);
  const code = live ? randomSmsCode() : config.demoSmsCode;
  const expire = new Date(Date.now() + 10 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const expireAt = `${expire.getFullYear()}-${pad(expire.getMonth() + 1)}-${pad(expire.getDate())} ${pad(expire.getHours())}:${pad(expire.getMinutes())}:${pad(expire.getSeconds())}`;
  const info = db.prepare("INSERT INTO sms_codes (phone,code,scene,expire_at) VALUES (?,?,?,?)").run(mobile, code, use, expireAt);
  if (live) {
    try {
      await sendVerifySms({
        phone: mobile,
        code,
        ...sms,
        timestamp: opts.timestamp,
        fetchImpl: opts.fetchImpl,
      });
    } catch (err) {
      db.prepare("DELETE FROM sms_codes WHERE id=?").run(info.lastInsertRowid);
      throw err;
    }
  }
  return live ? { sent: true } : { sent: false, demoCode: code };
}

module.exports = { buildCancelSms, sendSms, smsLive, sendVerifySms, issueSmsCode, tc3Authorization };
