const crypto = require("crypto");
const config = require("../config");
const { loginLive } = require("./wechat");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function percentEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function rpcBody(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
}

function signRpc(params, secret) {
  const stringToSign = `POST&${percentEncode("/")}&${percentEncode(rpcBody(params))}`;
  return crypto.createHmac("sha1", `${secret}&`).update(stringToSign).digest("base64");
}

function idVerifyConfigured(opts = {}) {
  const accessKeyId = opts.accessKeyId != null ? opts.accessKeyId : config.aliyun.accessKeyId;
  const accessKeySecret = opts.accessKeySecret != null ? opts.accessKeySecret : config.aliyun.accessKeySecret;
  return Boolean(accessKeyId && accessKeySecret);
}

async function verifyId2Meta({ realName, idCard, accessKeyId, accessKeySecret, fetchImpl, now }) {
  const params = {
    Action: "Id2MetaVerify",
    Format: "JSON",
    Version: "2019-03-07",
    AccessKeyId: accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    SignatureNonce: crypto.randomUUID(),
    Timestamp: (now || new Date()).toISOString().replace(/\.\d{3}Z$/, "Z"),
    ParamType: "normal",
    UserName: realName,
    IdentifyNum: idCard,
  };
  params.Signature = signRpc(params, accessKeySecret);
  const res = await (fetchImpl || fetch)("https://cloudauth.aliyuncs.com/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: rpcBody(params),
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (String(data.Code || "") !== "200") fail(400, "实名核验失败");
  const biz = String(data.ResultObject && data.ResultObject.BizCode || "");
  if (biz === "1") return { match: true };
  if (biz === "2") fail(400, "姓名与身份证号不一致");
  fail(400, "实名核验失败");
}

async function verifyIdentity({ realName, idCard, code } = {}, opts = {}) {
  const name = String(realName || "").trim();
  const card = String(idCard || "").trim().toUpperCase();
  if (!name) fail(400, "请填写真实姓名");
  if (!card) fail(400, "请填写身份证号");
  const accessKeyId = opts.accessKeyId != null ? opts.accessKeyId : config.aliyun.accessKeyId;
  const accessKeySecret = opts.accessKeySecret != null ? opts.accessKeySecret : config.aliyun.accessKeySecret;
  if (accessKeyId && accessKeySecret) {
    return verifyId2Meta({ realName: name, idCard: card, accessKeyId, accessKeySecret, fetchImpl: opts.fetchImpl, now: opts.now });
  }
  const live = opts.loginLive != null ? opts.loginLive : loginLive();
  if (live) fail(400, "实名核验尚未开通");
  if (code === "demo-bad") fail(400, "姓名与身份证号不一致");
  return { match: true, demo: true };
}

module.exports = { percentEncode, rpcBody, signRpc, idVerifyConfigured, verifyId2Meta, verifyIdentity };
