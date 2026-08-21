const { getDb } = require("../db");
const { attachAssetHost, addPoints } = require("./helpers");
const { leaderRecruitCopy } = require("./policy");
const config = require("../config");
const { ensureReferralCode } = require("./profile");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function guideCard(g, req) {
  if (!g) return null;
  return {
    id: g.id,
    name: g.name,
    avatar: attachAssetHost(req, g.avatar) || "",
    years: Number(g.years) || 0,
    specialties: g.specialties || "",
  };
}

function leaderView(row, req) {
  if (!row) return null;
  if (row.guide_id) {
    const g = getDb().prepare("SELECT * FROM guides WHERE id=?").get(row.guide_id);
    const card = guideCard(g, req);
    if (!card) return null;
    return { slot: row.slot, kind: "guide", id: card.id, name: card.name, avatar: card.avatar, years: card.years, specialties: card.specialties };
  }
  if (row.user_id) {
    const u = getDb().prepare("SELECT * FROM users WHERE id=?").get(row.user_id);
    if (!u || u.deleted_at) return null;
    return {
      slot: row.slot,
      kind: "user",
      id: u.id,
      userId: u.id,
      name: u.nickname || "领队",
      avatar: attachAssetHost(req, u.avatar) || "",
    };
  }
  return null;
}

function leadersOf(scheduleId, req) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) return [];
  let rows = db.prepare("SELECT * FROM schedule_leaders WHERE schedule_id=? AND status='assigned' ORDER BY slot").all(scheduleId);
  if (!rows.length && sch.guide_id) {
    db.prepare("INSERT OR IGNORE INTO schedule_leaders (schedule_id, slot, guide_id, status) VALUES (?,?,?,?)").run(
      scheduleId,
      1,
      sch.guide_id,
      "assigned"
    );
    rows = db.prepare("SELECT * FROM schedule_leaders WHERE schedule_id=? AND status='assigned' ORDER BY slot").all(scheduleId);
  }
  return rows.map((row) => leaderView(row, req)).filter(Boolean);
}

function emptySlots(scheduleId) {
  const used = new Set(
    getDb().prepare("SELECT slot FROM schedule_leaders WHERE schedule_id=? AND status='assigned'").all(scheduleId).map((r) => r.slot)
  );
  return [1, 2].filter((s) => !used.has(s));
}

function applyLeader(scheduleId, userId, { leadRef } = {}) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) fail(404, "排期不存在");
  if (sch.status === "cancelled") fail(400, "该拼团已解散");
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user || user.deleted_at) fail(401, "请先登录");
  const exist = db.prepare("SELECT id FROM schedule_leaders WHERE schedule_id=? AND user_id=? AND status='assigned'").get(scheduleId, userId);
  if (exist) fail(400, "你已经是本团领队");
  const slots = emptySlots(scheduleId);
  if (!slots.length) fail(400, "本团领队已满（最多两位）");
  const slot = slots[0];
  const guide = db.prepare("SELECT * FROM guides WHERE phone=? AND status!='off'").get(user.phone);
  db.prepare("INSERT INTO schedule_leaders (schedule_id, slot, guide_id, user_id, status) VALUES (?,?,?,?,?)").run(
    scheduleId,
    slot,
    guide ? guide.id : null,
    userId,
    "assigned"
  );
  if (slot === 1 && guide && !sch.guide_id) {
    db.prepare("UPDATE schedules SET guide_id=?, status=? WHERE id=?").run(guide.id, sch.status === "recruiting" ? "confirmed" : sch.status, scheduleId);
    db.prepare("UPDATE guides SET status='assigned' WHERE id=?").run(guide.id);
  }
  if (leadRef) {
    const code = String(leadRef).trim().toUpperCase();
    const referrer = db.prepare("SELECT * FROM users WHERE upper(referral_code)=? AND deleted_at IS NULL").get(code);
    if (referrer && Number(referrer.id) !== Number(userId)) {
      const dup = db.prepare("SELECT id FROM leader_referrals WHERE leader_user_id=?").get(userId);
      if (!dup) {
        db.prepare("INSERT INTO leader_referrals (referrer_id, leader_user_id, schedule_id, amount, status) VALUES (?,?,?,?,?)").run(
          referrer.id,
          userId,
          scheduleId,
          config.referral.leaderReward,
          "pending"
        );
      }
    }
  }
  return { slot, label: `领队${slot}`, copy: leaderRecruitCopy };
}

function settleLeaderRewards() {
  const db = getDb();
  const pending = db
    .prepare(
      `SELECT lr.* FROM leader_referrals lr
       JOIN schedule_leaders sl ON sl.user_id=lr.leader_user_id AND sl.status='assigned'
       JOIN schedules s ON s.id=sl.schedule_id
       WHERE lr.status='pending' AND s.status!='cancelled' AND s.start_date<=date('now')`
    )
    .all();
  let n = 0;
  for (const row of pending) {
    db.prepare("UPDATE leader_referrals SET status='settled' WHERE id=?").run(row.id);
    addPoints(row.referrer_id, Number(row.amount || config.referral.leaderReward), "推荐领队首次带队奖励", "leader_referral", row.id);
    n += 1;
  }
  return n;
}

function recruitPayload(userId) {
  const code = userId ? ensureReferralCode(userId) : "";
  return {
    copy: leaderRecruitCopy,
    reward: config.referral.leaderReward,
    code,
  };
}

module.exports = {
  leadersOf,
  applyLeader,
  settleLeaderRewards,
  recruitPayload,
  emptySlots,
  leaderView,
};
