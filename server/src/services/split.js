const { getDb } = require("../db");
const config = require("../config");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function listSplits(scheduleId) {
  return getDb().prepare("SELECT * FROM payment_splits WHERE schedule_id=? ORDER BY id").all(scheduleId);
}

function createSplitsForSchedule(scheduleId, { remark } = {}) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) fail(404, "排期不存在");
  const total = Number(
    db
      .prepare(
        `SELECT IFNULL(SUM(amount - IFNULL(refunded_amount,0)),0) AS s FROM payments
         WHERE schedule_id=? AND status='success' AND IFNULL(refund_of,0)=0
           AND IFNULL(scene,'') NOT IN ('member','route_bounty','trip_bounty','wallet_topup','company')`
      )
      .get(scheduleId).s
  );
  const existing = listSplits(scheduleId);
  const existingSum = existing.reduce((s, r) => s + Number(r.amount || 0), 0);
  if (existing.length && existingSum === total) return { splits: existing, reused: true, total };
  if (!total) fail(400, "暂无已支付金额，无法分账");
  if (existing.length) db.prepare("DELETE FROM payment_splits WHERE schedule_id=?").run(scheduleId);

  const guide = sch.guide_id ? db.prepare("SELECT name FROM guides WHERE id=?").get(sch.guide_id) : null;
  const platformRate = config.split.platformRate;
  const platform = Math.round(total * platformRate);
  let guideShare = Number(sch.cost_guide || 0);
  if (!guideShare) guideShare = Math.round(total * 0.05);
  if (guideShare > total - platform) guideShare = Math.max(0, total - platform);
  const merchant = Math.max(0, total - platform - guideShare);
  const rows = [
    { party: "platform", name: "同行者众平台", amount: platform, rate: platformRate, remark: remark || "技术服务费" },
    { party: "guide", name: guide?.name ? `导游 ${guide.name}` : "导游劳务", amount: guideShare, rate: 0, remark: "向导劳务" },
    {
      party: "merchant",
      name: sch.company_name || sch.organizer_name || "开团方",
      amount: merchant,
      rate: 0,
      remark: "商家结算",
    },
  ];
  const insert = db.prepare(
    "INSERT INTO payment_splits (schedule_id,party,name,amount,rate,status,remark) VALUES (?,?,?,?,?,?,?)"
  );
  const run = db.transaction(() => {
    for (const row of rows) {
      insert.run(scheduleId, row.party, row.name, row.amount, row.rate, "booked", row.remark);
    }
  });
  run();
  const splits = listSplits(scheduleId);
  return { splits, reused: false, total, mock: true };
}

module.exports = { listSplits, createSplitsForSchedule };
