const { getDb } = require("../db");

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

module.exports = { buildCancelSms, sendSms };
