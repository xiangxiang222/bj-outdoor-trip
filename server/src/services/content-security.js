const fs = require("fs");
const path = require("path");
const { loginLive, getAccessToken } = require("./wechat");

const BLOCKED = "所发布内容含违规信息";
const IMAGE_LIMIT = 1024 * 1024;

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function textBlocked(data) {
  if (!data) return false;
  if (data.errcode === 87014) return true;
  return data.result && data.result.suggest === "risky";
}

function imageBlocked(data) {
  return !!(data && data.errcode === 87014);
}

async function assertTextSafe(openid, content, scene) {
  const text = String(content || "").trim();
  if (!text || !loginLive() || !openid) return;
  const { access_token } = await getAccessToken();
  const res = await fetch(
    "https://api.weixin.qq.com/wxa/msg_sec_check?access_token=" + encodeURIComponent(access_token),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        openid: String(openid),
        scene: scene || 1,
        version: 2,
        content: text.slice(0, 2500),
      }),
    }
  );
  const data = await res.json();
  if (textBlocked(data)) fail(400, BLOCKED);
  if (data.errcode) fail(503, "内容安全检查暂不可用，请稍后再试");
}

async function assertTexts(openid, scene, parts) {
  for (const part of parts || []) {
    await assertTextSafe(openid, part, scene);
  }
}

async function bufferForCheck(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath);
  if (raw.length <= IMAGE_LIMIT && [".jpg", ".jpeg", ".png", ".gif"].includes(ext)) {
    return { buffer: raw, filename: ext === ".jpeg" ? "check.jpg" : `check${ext}` };
  }
  const sharp = require("sharp");
  let buffer;
  try {
    buffer = await sharp(raw)
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
  } catch {
    fail(400, "图片无法识别");
  }
  if (buffer.length > IMAGE_LIMIT) fail(400, "图片请小于 1MB");
  return { buffer, filename: "check.jpg" };
}

async function assertImageFile(filePath) {
  if (!loginLive() || !filePath) return;
  const { buffer, filename } = await bufferForCheck(filePath);
  const { access_token } = await getAccessToken();
  const form = new FormData();
  form.append("media", new Blob([buffer]), filename);
  const res = await fetch(
    "https://api.weixin.qq.com/wxa/img_sec_check?access_token=" + encodeURIComponent(access_token),
    { method: "POST", body: form }
  );
  const data = await res.json();
  if (imageBlocked(data)) fail(400, BLOCKED);
  if (data.errcode) fail(503, "内容安全检查暂不可用，请稍后再试");
}

module.exports = {
  BLOCKED,
  textBlocked,
  imageBlocked,
  assertTextSafe,
  assertTexts,
  assertImageFile,
};
