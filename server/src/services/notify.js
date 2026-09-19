const { getDb } = require("../db");
const config = require("../config");
const { sendSms } = require("./sms");
const { loginLive, sendSubscribeMessage } = require("./wechat");

function clip(raw, max) {
  const text = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text || " ";
  return text.slice(0, max);
}

function wechatTemplateId(scene) {
  if (scene === "merge") return String(config.wechat.subscribeMerge || "").trim();
  return "";
}

function sendWechatNotice({ userId, openid, scene, page, data, title, refType, refId }) {
  const db = getDb();
  let oid = String(openid || "").trim();
  if (!oid && userId) {
    const user = db.prepare("SELECT wechat_openid, is_virtual FROM users WHERE id=?").get(userId);
    if (user && Number(user.is_virtual)) return { skipped: true, reason: "virtual" };
    oid = String(user?.wechat_openid || "").trim();
  }
  const templateId = wechatTemplateId(scene);
  const payload = JSON.stringify({ page: page || "", title: title || "", data: data || {} });
  if (!oid) {
    db.prepare(
      `INSERT INTO wechat_notices (user_id,openid,scene,template_id,page,payload,status,ref_type,ref_id)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(userId || 0, "", scene || "", templateId, page || "", payload, "skipped", refType || "", refId || 0);
    return { skipped: true, reason: "no_openid", mock: true };
  }
  const live = loginLive() && Boolean(templateId);
  const status = live ? "queued" : "sent";
  const info = db
    .prepare(
      `INSERT INTO wechat_notices (user_id,openid,scene,template_id,page,payload,status,ref_type,ref_id)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(userId || 0, oid, scene || "", templateId, page || "", payload, status, refType || "", refId || 0);
  const id = Number(info.lastInsertRowid);
  if (!live) return { id, mock: true, status: "sent", openid: oid };
  return sendSubscribeMessage({
    openid: oid,
    templateId,
    page,
    data,
  })
    .then((res) => {
      const ok = !res.errcode || Number(res.errcode) === 0;
      db.prepare("UPDATE wechat_notices SET status=? WHERE id=?").run(ok ? "sent" : "failed", id);
      return { id, mock: false, status: ok ? "sent" : "failed", result: res };
    })
    .catch((err) => {
      db.prepare("UPDATE wechat_notices SET status=? WHERE id=?").run("failed", id);
      return { id, mock: false, status: "failed", error: err.message };
    });
}

function notifyUser({ userId, phone, scene, sms, wechat, refType, refId }) {
  const db = getDb();
  if (userId) {
    const user = db.prepare("SELECT is_virtual FROM users WHERE id=?").get(userId);
    if (user && Number(user.is_virtual)) return { sms: null, wechat: { skipped: true, reason: "virtual" } };
  }
  const smsRes = phone
    ? sendSms({ phone, scene, content: sms, refType, refId })
    : null;
  const wxRes = sendWechatNotice({
    userId,
    scene,
    page: wechat?.page,
    data: wechat?.data,
    title: wechat?.title,
    refType,
    refId,
  });
  return { sms: smsRes, wechat: wxRes };
}

module.exports = { clip, notifyUser, sendWechatNotice, wechatTemplateId };
