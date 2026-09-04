const dayjs = require("dayjs");
const { getDb } = require("../db");
const { addPoints } = require("./helpers");

const PRIZES = [
  { key: "thanks", label: "谢谢参与", weight: 36, points: 0 },
  { key: "points20", label: "20 积分", weight: 24, points: 20 },
  { key: "points50", label: "50 积分", weight: 16, points: 50 },
  { key: "water", label: "车上矿泉水一瓶", weight: 12, points: 0 },
  { key: "points100", label: "100 积分", weight: 8, points: 100 },
  { key: "coupon", label: "下团减 20 元券", weight: 4, points: 0 },
];

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function pickPrize() {
  const total = PRIZES.reduce((sum, p) => sum + p.weight, 0);
  let n = Math.random() * total;
  for (const prize of PRIZES) {
    n -= prize.weight;
    if (n <= 0) return prize;
  }
  return PRIZES[0];
}

function prizeOf(key) {
  return PRIZES.find((p) => p.key === key) || PRIZES[0];
}

function mapDraw(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    phase: row.phase,
    prizeKey: row.prize_key,
    prizeLabel: row.prize_label,
    doubled: !!row.doubled,
    createdAt: row.created_at,
    ...extra,
  };
}

function getDraw(userId, scheduleId, phase) {
  return getDb()
    .prepare("SELECT * FROM lottery_draws WHERE user_id=? AND IFNULL(schedule_id,0)=? AND phase=?")
    .get(userId, Number(scheduleId || 0), phase);
}

function applyPrize(userId, prize, times) {
  const n = times > 1 ? times : 1;
  if (prize.points > 0) {
    addPoints(userId, prize.points * n, n > 1 ? `抽奖翻倍 ${prize.label}` : `抽奖 ${prize.label}`, "lottery", userId);
  }
}

function requireJoined(userId, scheduleId) {
  const db = getDb();
  const en = db
    .prepare("SELECT * FROM enrollments WHERE user_id=? AND schedule_id=? AND status='joined'")
    .get(userId, scheduleId);
  if (!en) fail(400, "请先报名本团");
  return en;
}

function requireCompleted(userId, scheduleId) {
  const en = requireJoined(userId, scheduleId);
  if (!en.completed_at) fail(400, "请先在回来的大巴上点「完成活动」");
  return en;
}

function drawPre(userId, scheduleId) {
  const exist = getDraw(userId, 0, "pre") || getDraw(userId, Number(scheduleId || 0), "pre");
  if (exist) return mapDraw(exist, { already: true });
  const prize = pickPrize();
  applyPrize(userId, prize, 1);
  const info = getDb()
    .prepare("INSERT INTO lottery_draws (user_id,schedule_id,phase,prize_key,prize_label,doubled) VALUES (?,?,?,?,?,0)")
    .run(userId, 0, "pre", prize.key, prize.label);
  return mapDraw({ id: info.lastInsertRowid, phase: "pre", prize_key: prize.key, prize_label: prize.label, doubled: 0, created_at: dayjs().format("YYYY-MM-DD HH:mm:ss") });
}

function drawPost(userId, scheduleId) {
  const sid = Number(scheduleId);
  if (!sid) fail(400, "请选择行程");
  requireCompleted(userId, sid);
  const exist = getDraw(userId, sid, "post");
  if (exist) return mapDraw(exist, { already: true });
  const prize = pickPrize();
  const pre = getDraw(userId, sid, "pre") || getDraw(userId, 0, "pre");
  const doubled = !!(pre && pre.prize_key === prize.key && prize.key !== "thanks");
  applyPrize(userId, prize, doubled ? 2 : 1);
  const info = getDb()
    .prepare("INSERT INTO lottery_draws (user_id,schedule_id,phase,prize_key,prize_label,doubled) VALUES (?,?,?,?,?,?)")
    .run(userId, sid, "post", prize.key, prize.label, doubled ? 1 : 0);
  return mapDraw(
    { id: info.lastInsertRowid, phase: "post", prize_key: prize.key, prize_label: prize.label, doubled: doubled ? 1 : 0, created_at: dayjs().format("YYYY-MM-DD HH:mm:ss") },
    { matched: doubled, preLabel: pre ? pre.prize_label : "" }
  );
}

function lotteryState(userId, scheduleId) {
  const sid = Number(scheduleId || 0);
  const pre = getDraw(userId, sid, "pre") || (sid ? getDraw(userId, 0, "pre") : null);
  const post = sid ? getDraw(userId, sid, "post") : null;
  return {
    prizes: PRIZES.map((p) => ({ key: p.key, label: p.label })),
    pre: mapDraw(pre),
    post: mapDraw(post),
    canPre: !getDraw(userId, 0, "pre") && !getDraw(userId, sid, "pre"),
    canPost: false,
  };
}

module.exports = { PRIZES, pickPrize, prizeOf, drawPre, drawPost, lotteryState, getDraw, requireJoined, requireCompleted };
