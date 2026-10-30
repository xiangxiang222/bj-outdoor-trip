const { getDb } = require("../db");

const UNCLOSED_MESSAGE = "有尚未确认关闭的微信支付，请先在订单中完成支付或联系客服处理后再管理认证";
const PAYING_MESSAGE = "有报名正在支付，请完成支付或等待支付关闭后再管理认证";

// The preview and identity mutation must use exactly the same payment facts.
// This deliberately does not expire payments: local age is not WeChat closure.
function paymentBlocksFor(user) {
  const userId = Number(user && user.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return [];
  const db = getDb();
  const enrollments = db.prepare("SELECT id,schedule_id FROM enrollments WHERE user_id=?").all(userId);
  const ownEnrollments = new Map(enrollments.map((row) => [Number(row.id), row]));
  const candidates = db.prepare(`SELECT p.*,e.user_id AS enrollment_user_id,e.schedule_id AS enrollment_schedule_id
    FROM payments p LEFT JOIN enrollments e ON e.id=p.enrollment_id
    WHERE IFNULL(p.scene,'')!='member' AND IFNULL(p.refund_of,0)=0
      AND (IFNULL(p.enrollment_id,0)>0 OR p.scene='company')
      AND ((p.status IN ('pending','cancelled','settling') AND TRIM(IFNULL(p.wechat_prepay_id,''))!='')
        OR (p.status='pending' AND p.created_at>=datetime('now','localtime','-30 minutes')))
      AND (p.user_id=? OR e.user_id=? OR p.scene='company')
    ORDER BY p.id`).all(userId, userId);
  const blocks = [];
  for (const payment of candidates) {
    const ownPayer = Number(payment.user_id) === userId;
    let enrollment = null;
    if (payment.scene === "company") {
      let lines;
      try { lines = JSON.parse(payment.remark || "{}").lines; } catch { lines = []; }
      // Only actual line IDs identify the included bookings. A shared schedule
      // or an untrusted line.userId does not make this the user's payment.
      if (Array.isArray(lines)) {
        for (const line of lines) {
          const found = ownEnrollments.get(Number(line && line.id));
          if (found) { enrollment = found; break; }
        }
      }
    } else if (Number(payment.enrollment_user_id) === userId) {
      enrollment = ownEnrollments.get(Number(payment.enrollment_id));
    }
    if (!ownPayer && !enrollment) continue;
    const realPrepay = !!String(payment.wechat_prepay_id || "").trim();
    blocks.push({
      id:Number(payment.id),
      scheduleId:Number(enrollment ? enrollment.schedule_id : payment.enrollment_schedule_id || payment.schedule_id) || null,
      // A payer can see their own payment without learning another member's
      // enrollment ID, amounts, contact details or the company's full lines.
      enrollmentId:enrollment ? Number(enrollment.id) : null,
      reason:realPrepay ? "wechat_payment_unclosed" : "payment_in_progress",
      message:realPrepay ? UNCLOSED_MESSAGE : PAYING_MESSAGE,
    });
  }
  return blocks;
}

module.exports = { paymentBlocksFor };
