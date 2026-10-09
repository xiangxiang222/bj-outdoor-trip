const crypto = require("crypto");
const { getDb } = require("../db");
const config = require("../config");
const { rpcBody, signRpc } = require("./id-verify");

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

function smsLive(opts = {}) {
  const accessKeyId = opts.accessKeyId != null ? opts.accessKeyId : config.aliyun.accessKeyId;
  const accessKeySecret = opts.accessKeySecret != null ? opts.accessKeySecret : config.aliyun.accessKeySecret;
  const signName = opts.signName != null ? opts.signName : config.sms.signName;
  const templateCode = opts.templateCode != null ? opts.templateCode : config.sms.templateCode;
  return Boolean(accessKeyId && accessKeySecret && signName && templateCode);
}

function randomSmsCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

async function sendVerifySms({ phone, code, accessKeyId, accessKeySecret, signName, templateCode, fetchImpl }) {
  const params = {
    Action: "SendSms",
    Format: "JSON",
    Version: "2017-05-25",
    AccessKeyId: accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    RegionId: "cn-hangzhou",
    PhoneNumbers: phone,
    SignName: signName,
    TemplateCode: templateCode,
    TemplateParam: JSON.stringify({ code }),
  };
  params.Signature = signRpc(params, accessKeySecret);
  const res = await (fetchImpl || fetch)("https://dysmsapi.aliyuncs.com/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: rpcBody(params),
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (data.Code !== "OK") fail(400, "短信发送失败");
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
  const live = smsLive(opts);
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
        accessKeyId: opts.accessKeyId != null ? opts.accessKeyId : config.aliyun.accessKeyId,
        accessKeySecret: opts.accessKeySecret != null ? opts.accessKeySecret : config.aliyun.accessKeySecret,
        signName: opts.signName != null ? opts.signName : config.sms.signName,
        templateCode: opts.templateCode != null ? opts.templateCode : config.sms.templateCode,
        fetchImpl: opts.fetchImpl,
      });
    } catch (err) {
      db.prepare("DELETE FROM sms_codes WHERE id=?").run(info.lastInsertRowid);
      throw err;
    }
  }
  return live ? { sent: true } : { sent: false, demoCode: code };
}

module.exports = { buildCancelSms, sendSms, smsLive, sendVerifySms, issueSmsCode };
