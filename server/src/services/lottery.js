const dayjs = require("dayjs");
const { getDb } = require("../db");
const { addPoints } = require("./helpers");

const PRIZES = [
  { key: "thanks", label: "谢谢参与", weight: 36, points: 0, level: 9, kind: "thanks", color: "#c8ccc4" },
  { key: "points20", label: "20 积分", weight: 24, points: 20, level: 4, kind: "points", color: "#7cb342" },
  { key: "points50", label: "50 积分", weight: 16, points: 50, level: 3, kind: "points", color: "#42a5f5" },
  { key: "water", label: "车上矿泉水一瓶", weight: 12, points: 0, level: 3, kind: "physical", color: "#26a69a" },
  { key: "points100", label: "100 积分", weight: 8, points: 100, level: 2, kind: "points", color: "#f5a623" },
  { key: "coupon", label: "下团减 20 元券", weight: 4, points: 0, level: 1, kind: "coupon", color: "#e1251b" },
];

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function nowText() {
  return dayjs().format("YYYY-MM-DD HH:mm:ss");
}

function defaultPool() {
  return PRIZES.map((p, i) => ({
    id: 0,
    campaignId: 0,
    key: p.key,
    label: p.label,
    name: p.label,
    level: p.level,
    kind: p.kind,
    points: p.points,
    weight: p.weight,
    stock: -1,
    stockUsed: 0,
    color: p.color,
    couponCampaignId: 0,
    sort: i,
  }));
}

function mapPrizeRow(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    key: row.prize_key || `p${row.id}`,
    label: row.name,
    name: row.name,
    level: Number(row.level || 4),
    kind: row.kind || "thanks",
    points: Number(row.points || 0),
    weight: Number(row.weight || 0),
    stock: Number(row.stock ?? -1),
    stockUsed: Number(row.stock_used || 0),
    color: row.color || "#c8ccc4",
    couponCampaignId: Number(row.coupon_campaign_id || 0),
    sort: Number(row.sort_order || 0),
  };
}

function listPrizeRows(campaignId) {
  return getDb()
    .prepare("SELECT * FROM lottery_prizes WHERE campaign_id=? ORDER BY sort_order ASC, id ASC")
    .all(campaignId);
}

function getCampaignBySchedule(scheduleId) {
  const sid = Number(scheduleId || 0);
  if (!sid) return null;
  return getDb().prepare("SELECT * FROM lottery_campaigns WHERE schedule_id=?").get(sid) || null;
}

function isLotteryEnabled(scheduleId) {
  const row = getCampaignBySchedule(scheduleId);
  return !!(row && Number(row.enabled) === 1 && listPrizeRows(row.id).length);
}

function resolvePool(scheduleId) {
  const campaign = getCampaignBySchedule(scheduleId);
  if (!campaign || Number(campaign.enabled) !== 1) {
    return { campaign: null, prizes: defaultPool() };
  }
  const prizes = listPrizeRows(campaign.id).map(mapPrizeRow);
  if (!prizes.length) return { campaign, prizes: defaultPool() };
  return { campaign, prizes };
}

function publicPrizes(prizes) {
  return (prizes || []).map((p) => ({
    key: p.key,
    label: p.label,
    level: p.level,
    kind: p.kind,
    color: p.color,
  }));
}

function sectorIndexOf(prizes, key) {
  const i = (prizes || []).findIndex((p) => p.key === key);
  return i >= 0 ? i : 0;
}

function isThanks(prize) {
  if (!prize) return true;
  return prize.kind === "thanks" || prize.key === "thanks" || Number(prize.level) >= 9;
}

function availablePrizes(prizes) {
  return (prizes || []).filter((p) => Number(p.stock) < 0 || Number(p.stockUsed) < Number(p.stock));
}

function pickPrize(prizes, rng) {
  const pool = prizes && prizes.length ? prizes : defaultPool();
  const open = availablePrizes(pool);
  if (!open.length) fail(400, "奖品已抽完");
  const weighted = open.filter((p) => Number(p.weight) > 0);
  const use = weighted.length ? weighted : open;
  const total = use.reduce((sum, p) => sum + Number(p.weight || 0), 0);
  const roll = typeof rng === "function" ? rng() : Math.random();
  if (total <= 0) return use[Math.min(use.length - 1, Math.floor(roll * use.length))] || use[0];
  let n = roll * total;
  for (const prize of use) {
    n -= Number(prize.weight || 0);
    if (n <= 0) return prize;
  }
  return use[0];
}

function prizeOf(key, prizes) {
  const pool = prizes && prizes.length ? prizes : defaultPool();
  return pool.find((p) => p.key === key) || pool[0];
}

function mapDraw(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    phase: row.phase,
    prizeKey: row.prize_key,
    prizeLabel: row.prize_label,
    level: Number(row.level || 0),
    doubled: !!row.doubled,
    createdAt: row.created_at,
    sectorIndex: extra.sectorIndex,
    spinSeconds: extra.spinSeconds,
    ...extra,
  };
}

function getDraw(userId, scheduleId, phase) {
  return getDb()
    .prepare("SELECT * FROM lottery_draws WHERE user_id=? AND IFNULL(schedule_id,0)=? AND phase=?")
    .get(userId, Number(scheduleId || 0), phase);
}

function unusedAssign(campaignId, userId) {
  if (!campaignId || !userId) return null;
  return (
    getDb()
      .prepare("SELECT * FROM lottery_assigns WHERE campaign_id=? AND user_id=? AND used_at IS NULL")
      .get(campaignId, userId) || null
  );
}

function applyPrize(userId, prize, times) {
  const n = times > 1 ? times : 1;
  if (prize.points > 0) {
    addPoints(userId, prize.points * n, n > 1 ? `抽奖翻倍 ${prize.label}` : `抽奖 ${prize.label}`, "lottery", userId);
  }
  if (prize.kind === "coupon" && prize.couponCampaignId) {
    try {
      const { grantCoupons } = require("./coupons");
      grantCoupons(prize.couponCampaignId, { userIds: [userId] });
    } catch {
      /* 券已领完或已有一张时不影响抽奖入账 */
    }
  }
}

function requireJoined(userId, scheduleId) {
  const en = getDb()
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

function consumeStock(prize) {
  if (!prize.id) return;
  getDb().prepare("UPDATE lottery_prizes SET stock_used=IFNULL(stock_used,0)+1 WHERE id=?").run(prize.id);
}

function markAssignUsed(assignId) {
  if (!assignId) return;
  getDb().prepare("UPDATE lottery_assigns SET used_at=? WHERE id=?").run(nowText(), assignId);
}

function insertDraw({ userId, scheduleId, phase, prize, doubled, campaignId, assigned }) {
  const info = getDb()
    .prepare(
      `INSERT INTO lottery_draws (user_id,schedule_id,phase,prize_key,prize_label,doubled,prize_id,campaign_id,assigned,level)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      userId,
      Number(scheduleId || 0),
      phase,
      prize.key,
      prize.label,
      doubled ? 1 : 0,
      prize.id || 0,
      campaignId || 0,
      assigned ? 1 : 0,
      prize.level || 0
    );
  return {
    id: info.lastInsertRowid,
    phase,
    prize_key: prize.key,
    prize_label: prize.label,
    doubled: doubled ? 1 : 0,
    level: prize.level || 0,
    created_at: nowText(),
  };
}

function choosePrize(userId, prizes, campaign) {
  const assign = campaign ? unusedAssign(campaign.id, userId) : null;
  if (assign) {
    const forced = prizes.find((p) => Number(p.id) === Number(assign.prize_id));
    if (forced) return { prize: forced, assigned: true, assignId: assign.id };
  }
  return { prize: pickPrize(prizes), assigned: false, assignId: 0 };
}

function fulfillDraw(userId, prize, times, assignedMeta) {
  applyPrize(userId, prize, times);
  consumeStock(prize);
  if (assignedMeta.assignId) markAssignUsed(assignedMeta.assignId);
}

function drawPayload(row, prizes, campaign, extra = {}) {
  const spinSeconds = Number(campaign?.spin_seconds || 5);
  return mapDraw(row, {
    sectorIndex: sectorIndexOf(prizes, row.prize_key),
    spinSeconds: spinSeconds >= 2 && spinSeconds <= 10 ? spinSeconds : 5,
    ...extra,
  });
}

function drawPre(userId, scheduleId) {
  const sid = Number(scheduleId || 0);
  const { campaign, prizes } = resolvePool(sid);
  const useCampaign = !!(campaign && Number(campaign.enabled) === 1);
  const storeSid = useCampaign ? sid : 0;
  const exist = useCampaign
    ? getDraw(userId, storeSid, "pre")
    : getDraw(userId, 0, "pre") || getDraw(userId, sid, "pre");
  if (exist) return drawPayload(exist, prizes, campaign, { already: true });

  const picked = choosePrize(userId, prizes, campaign);
  const run = getDb().transaction(() => {
    fulfillDraw(userId, picked.prize, 1, picked);
    return insertDraw({
      userId,
      scheduleId: storeSid,
      phase: "pre",
      prize: picked.prize,
      doubled: false,
      campaignId: campaign?.id || 0,
      assigned: picked.assigned,
    });
  });
  return drawPayload(run(), prizes, campaign);
}

function drawPost(userId, scheduleId) {
  const sid = Number(scheduleId);
  if (!sid) fail(400, "请选择行程");
  requireCompleted(userId, sid);
  const { campaign, prizes } = resolvePool(sid);
  const exist = getDraw(userId, sid, "post");
  if (exist) return drawPayload(exist, prizes, campaign, { already: true });

  const picked = choosePrize(userId, prizes, campaign);
  const pre = getDraw(userId, sid, "pre") || getDraw(userId, 0, "pre");
  const doubled = !!(pre && pre.prize_key === picked.prize.key && !isThanks(picked.prize));
  const run = getDb().transaction(() => {
    fulfillDraw(userId, picked.prize, doubled ? 2 : 1, picked);
    return insertDraw({
      userId,
      scheduleId: sid,
      phase: "post",
      prize: picked.prize,
      doubled,
      campaignId: campaign?.id || 0,
      assigned: picked.assigned,
    });
  });
  return drawPayload(run(), prizes, campaign, { matched: doubled, preLabel: pre ? pre.prize_label : "" });
}

function campaignPublic(campaign) {
  const seconds = Number(campaign?.spin_seconds || 5);
  return {
    title: (campaign && campaign.title) || "活动抽奖",
    spinSeconds: seconds >= 2 && seconds <= 10 ? seconds : 5,
    enabled: !!(campaign && Number(campaign.enabled) === 1),
    note: (campaign && campaign.note) || "",
  };
}

function canPostDraw(userId, sid) {
  if (!userId || !sid) return false;
  if (getDraw(userId, sid, "post")) return false;
  const en = getDb()
    .prepare("SELECT completed_at FROM enrollments WHERE user_id=? AND schedule_id=? AND status='joined'")
    .get(userId, sid);
  return !!(en && en.completed_at);
}

function lotteryState(userId, scheduleId) {
  const sid = Number(scheduleId || 0);
  const { campaign, prizes } = resolvePool(sid);
  const useCampaign = !!(campaign && Number(campaign.enabled) === 1);
  const pre = userId
    ? useCampaign
      ? getDraw(userId, sid, "pre")
      : getDraw(userId, sid, "pre") || getDraw(userId, 0, "pre")
    : null;
  const post = userId && sid ? getDraw(userId, sid, "post") : null;
  const canPre = userId
    ? useCampaign
      ? !getDraw(userId, sid, "pre")
      : !getDraw(userId, 0, "pre") && !getDraw(userId, sid, "pre")
    : false;
  return {
    ...campaignPublic(campaign),
    prizes: publicPrizes(prizes),
    pre: mapDraw(pre, { sectorIndex: pre ? sectorIndexOf(prizes, pre.prize_key) : 0 }),
    post: mapDraw(post, { sectorIndex: post ? sectorIndexOf(prizes, post.prize_key) : 0 }),
    canPre,
    canPost: canPostDraw(userId, sid),
  };
}

module.exports = {
  PRIZES,
  pickPrize,
  prizeOf,
  drawPre,
  drawPost,
  lotteryState,
  getDraw,
  requireJoined,
  requireCompleted,
  isLotteryEnabled,
  resolvePool,
  defaultPool,
  publicPrizes,
  mapPrizeRow,
  listPrizeRows,
  getCampaignBySchedule,
  sectorIndexOf,
  isThanks,
};
