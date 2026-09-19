const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const config = require("../config");

const UNIFIED_ORDER_URL = "https://api.mch.weixin.qq.com/pay/unifiedorder";
const ORDER_QUERY_URL = "https://api.mch.weixin.qq.com/pay/orderquery";
const REFUND_URL = "https://api.mch.weixin.qq.com/secapi/pay/refund";

function demoSecret(value) {
  const s = String(value || "");
  return !s || s.startsWith("wx_demo");
}

function loginLive() {
  const { appId, appSecret } = config.wechat;
  return !demoSecret(appId) && !demoSecret(appSecret);
}

function payLive() {
  const { mock, appId, mchId, mchKey } = config.wechat;
  return !mock && !demoSecret(appId) && Boolean(mchId && mchKey);
}

function mockOpenid(code) {
  return `demo_openid_${crypto.createHash("md5").update(String(code || "guest")).digest("hex").slice(0, 12)}`;
}

async function code2session(jsCode) {
  if (!loginLive()) {
    return { openid: mockOpenid(jsCode), session_key: "demo_session", unionid: "" };
  }
  const url =
    "https://api.weixin.qq.com/sns/jscode2session?appid=" +
    encodeURIComponent(config.wechat.appId) +
    "&secret=" +
    encodeURIComponent(config.wechat.appSecret) +
    "&js_code=" +
    encodeURIComponent(jsCode) +
    "&grant_type=authorization_code";
  const res = await fetch(url);
  return res.json();
}

function mockPrepay(tradeNo, amountFen) {
  return {
    timeStamp: String(Math.floor(Date.now() / 1000)),
    nonceStr: crypto.randomBytes(8).toString("hex"),
    package: `prepay_id=mock_${tradeNo}`,
    signType: "MD5",
    paySign: "DEMO_PAY_SIGN",
    tradeNo,
    amountFen,
    mock: true,
  };
}

function yuanToFen(yuan) {
  return Math.round(Number(yuan || 0) * 100);
}

function signMd5(params, key) {
  const line =
    Object.keys(params)
      .filter((k) => k !== "sign" && params[k] !== undefined && params[k] !== "")
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&") +
    "&key=" +
    key;
  return crypto.createHash("md5").update(line, "utf8").digest("hex").toUpperCase();
}

function xmlToObj(xml) {
  const out = {};
  String(xml || "").replace(/<(?!xml\b)(\w+)>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/\1>/gi, (_, key, cdata, text) => {
    out[key] = cdata != null ? cdata : text;
    return "";
  });
  return out;
}

function objToXml(obj) {
  const body = Object.keys(obj)
    .filter((k) => obj[k] !== undefined && obj[k] !== "")
    .map((k) => `<${k}><![CDATA[${obj[k]}]]></${k}>`)
    .join("");
  return `<xml>${body}</xml>`;
}

function verifySign(params, key) {
  if (!params || !params.sign || !key) return false;
  return signMd5(params, key) === String(params.sign).toUpperCase();
}

function notifyReply(ok, message) {
  return objToXml({
    return_code: ok ? "SUCCESS" : "FAIL",
    return_msg: message || (ok ? "OK" : "FAIL"),
  });
}

function jsapiPayParams(prepayId) {
  const params = {
    appId: config.wechat.appId,
    timeStamp: String(Math.floor(Date.now() / 1000)),
    nonceStr: crypto.randomBytes(8).toString("hex"),
    package: `prepay_id=${prepayId}`,
    signType: "MD5",
  };
  return {
    timeStamp: params.timeStamp,
    nonceStr: params.nonceStr,
    package: params.package,
    signType: params.signType,
    paySign: signMd5(params, config.wechat.mchKey),
  };
}

async function postXml(url, params) {
  const signed = { ...params, sign: signMd5(params, config.wechat.mchKey) };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: objToXml(signed),
  });
  return xmlToObj(await res.text());
}

function wechatFail(data, fallback) {
  const err = new Error(data.err_code_des || data.return_msg || fallback);
  err.status = 400;
  throw err;
}

async function unifiedOrder({ openid, tradeNo, amountFen, body, clientIp }) {
  const data = await postXml(UNIFIED_ORDER_URL, {
    appid: config.wechat.appId,
    mch_id: config.wechat.mchId,
    nonce_str: crypto.randomBytes(16).toString("hex"),
    body: String(body || "同行者众").slice(0, 40),
    out_trade_no: String(tradeNo),
    total_fee: String(amountFen),
    spbill_create_ip: clientIp || "127.0.0.1",
    notify_url: config.wechat.notifyUrl,
    trade_type: "JSAPI",
    openid,
  });
  if (data.return_code !== "SUCCESS" || data.result_code !== "SUCCESS" || !data.prepay_id) {
    wechatFail(data, "微信下单失败");
  }
  return data.prepay_id;
}

async function queryOrder(tradeNo) {
  const data = await postXml(ORDER_QUERY_URL, {
    appid: config.wechat.appId,
    mch_id: config.wechat.mchId,
    out_trade_no: String(tradeNo),
    nonce_str: crypto.randomBytes(16).toString("hex"),
  });
  if (data.return_code !== "SUCCESS") wechatFail(data, "查询微信支付失败");
  return data;
}

function loadMchCert() {
  const certPath = config.wechat.mchCertPath;
  const keyPath = config.wechat.mchKeyPath;
  if (!certPath || !keyPath) return null;
  try {
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
      passphrase: config.wechat.mchCertPass || String(config.wechat.mchId || ""),
    };
  } catch {
    return null;
  }
}

function refundCertLive() {
  return Boolean(loadMchCert());
}

function postXmlCert(url, params, cert) {
  const signed = { ...params, sign: signMd5(params, config.wechat.mchKey) };
  const xml = objToXml(signed);
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname,
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", "Content-Length": Buffer.byteLength(xml) },
        cert: cert.cert,
        key: cert.key,
        passphrase: cert.passphrase || undefined,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(xmlToObj(Buffer.concat(chunks).toString("utf8"))));
      }
    );
    req.on("error", reject);
    req.write(xml);
    req.end();
  });
}

async function refundOrder({ tradeNo, transactionId, refundNo, totalFen, refundFen }) {
  if (!payLive()) {
    return { mock: true, refund_id: `mock_${refundNo}`, out_refund_no: refundNo };
  }
  const cert = loadMchCert();
  if (!cert) {
    const err = new Error("未配置商户API证书，无法原路退款");
    err.status = 400;
    throw err;
  }
  const params = {
    appid: config.wechat.appId,
    mch_id: config.wechat.mchId,
    nonce_str: crypto.randomBytes(16).toString("hex"),
    out_refund_no: String(refundNo),
    total_fee: String(totalFen),
    refund_fee: String(refundFen),
    op_user_id: String(config.wechat.mchId),
  };
  if (transactionId) params.transaction_id = String(transactionId);
  else if (tradeNo) params.out_trade_no = String(tradeNo);
  else {
    const err = new Error("缺少原支付单号，无法退款");
    err.status = 400;
    throw err;
  }
  const data = await postXmlCert(REFUND_URL, params, cert);
  if (data.return_code !== "SUCCESS" || data.result_code !== "SUCCESS") {
    wechatFail(data, "微信退款失败");
  }
  return data;
}

function clientIp(req) {
  const xf = req && req.headers && req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  const ip = (req && req.ip) || "";
  return ip.replace(/^::ffff:/, "") || "127.0.0.1";
}

const tokenCache = { value: "", exp: 0 };

async function getAccessToken() {
  if (!loginLive()) return { access_token: "mock_token", mock: true };
  if (tokenCache.value && Date.now() < tokenCache.exp) {
    return { access_token: tokenCache.value, mock: false };
  }
  const url =
    "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=" +
    encodeURIComponent(config.wechat.appId) +
    "&secret=" +
    encodeURIComponent(config.wechat.appSecret);
  const res = await fetch(url);
  const data = await res.json();
  if (!data.access_token) {
    const err = new Error(data.errmsg || "获取微信 access_token 失败");
    err.payload = data;
    throw err;
  }
  tokenCache.value = data.access_token;
  tokenCache.exp = Date.now() + Math.max(60, Number(data.expires_in || 7200) - 120) * 1000;
  return { access_token: data.access_token, mock: false };
}

function toSubscribeData(data) {
  const out = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    out[key] = { value: String(value == null ? " " : value) };
  });
  return out;
}

async function sendSubscribeMessage({ openid, templateId, page, data }) {
  if (!openid || !templateId) return { errcode: 0, errmsg: "skipped", mock: true };
  if (!loginLive()) return { errcode: 0, errmsg: "ok", mock: true };
  const { access_token } = await getAccessToken();
  const res = await fetch(
    "https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=" + encodeURIComponent(access_token),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        touser: openid,
        template_id: templateId,
        page: page || "",
        data: toSubscribeData(data),
        miniprogram_state: config.wechat.mpState || "formal",
      }),
    }
  );
  return res.json();
}

async function getWxaCode({ scene, page }) {
  if (!loginLive()) return null;
  const { access_token } = await getAccessToken();
  const res = await fetch(
    "https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=" + encodeURIComponent(access_token),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scene: String(scene || "").slice(0, 32),
        page: page || "pages/schedule/schedule",
        check_path: false,
        env_version: config.wechat.mpState === "formal" ? "release" : "trial",
        width: 280,
      }),
    }
  );
  const buf = Buffer.from(await res.arrayBuffer());
  const head = buf.slice(0, 32).toString("utf8");
  if (head.includes("errcode") || head.includes("{")) return null;
  return buf;
}

module.exports = {
  code2session,
  mockPrepay,
  mockOpenid,
  loginLive,
  payLive,
  yuanToFen,
  signMd5,
  xmlToObj,
  objToXml,
  verifySign,
  notifyReply,
  jsapiPayParams,
  unifiedOrder,
  queryOrder,
  refundOrder,
  refundCertLive,
  loadMchCert,
  clientIp,
  getAccessToken,
  sendSubscribeMessage,
  getWxaCode,
  UNIFIED_ORDER_URL,
  ORDER_QUERY_URL,
  REFUND_URL,
};
