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

const MODE_LABELS = {
  off: "",
  pre: "报名前抽奖",
  enroll: "报名后抽奖",
  both: "报名前和报名后都可抽",
};

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function nowText() {
  return dayjs().format("YYYY-MM-DD HH:mm:ss");
}

function normalizeDrawMode(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (["off", "none", "0", "false", "no"].includes(v)) return "off";
  if (["pre", "before"].includes(v)) return "pre";
  if (["enroll", "after", "post"].includes(v)) return "enroll";
  if (["both", "all"].includes(v)) return "both";
  return "";
}

function drawModeOf(campaign) {
  if (!campaign || Number(campaign.enabled) !== 1) return "off";
  return normalizeDrawMode(campaign.draw_mode) || "both";
}

function allowsPre(mode) {
  return mode === "pre" || mode === "both";
}

function allowsEnroll(mode) {
  return mode === "enroll" || mode === "both";
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

function lotteryPublic(scheduleId) {
  const campaign = getCampaignBySchedule(scheduleId);
  const mode = drawModeOf(campaign);
  const enabled = mode !== "off" && isLotteryEnabled(scheduleId);
  return {
    lotteryEnabled: enabled,
    lotteryMode: enabled ? mode : "off",
    lotteryLabel: enabled ? MODE_LABELS[mode] || "" : "",
  };
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

function rateOf(prize, prizes) {
  const total = (prizes || []).reduce((sum, p) => sum + Number(p.weight || 0), 0);
  if (!total) return 0;
  return Math.round((Number(prize.weight || 0) / total) * 1000) / 10;
}

function prizeInfoOf(prize) {
  if (!prize || isThanks(prize)) return "谢谢参与，没有奖品";
  if (prize.kind === "points") return `${prize.points} 积分`;
  if (prize.kind === "coupon") return "优惠券一张";
  return prize.label || prize.name || "实物奖品";
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
  const prize = extra.prize || null;
  return {
    id: row.id,
    phase: row.phase,
    prizeKey: row.prize_key,
    prizeLabel: row.prize_label,
    level: Number(row.level || 0),
    doubled: !!row.doubled,
    createdAt: row.created_at,
    claimed: extra.deferred ? !!row.claimed_at : extra.claimed !== false,
    claimedAt: row.claimed_at || "",
    sectorIndex: extra.sectorIndex,
    spinSeconds: extra.spinSeconds,
    rate: extra.rate,
    prizeKind: prize ? prize.kind : extra.prizeKind,
    prizePoints: prize ? prize.points : extra.prizePoints,
    prizeInfo: extra.prizeInfo,
    deferred: !!extra.deferred,
    ...extra,
    prize: undefined,
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

function requireEnrolled(userId, scheduleId) {
  const en = getDb()
    .prepare(
      "SELECT * FROM enrollments WHERE user_id=? AND schedule_id=? AND status IN ('joined','applied','waitlist')"
    )
    .get(userId, scheduleId);
  if (!en) fail(400, "请先报名本团再抽");
  return en;
}

function requireCompleted(userId, scheduleId) {
  const en = requireJoined(userId, scheduleId);
  if (!en.completed_at) fail(400, "请先在回来的大巴上点「完成活动」");
  return en;
}

function eligibleAfterTripLottery(userId, scheduleId) {
  const rows = getDb()
    .prepare("SELECT status, pay_status FROM enrollments WHERE user_id=? AND schedule_id=?")
    .all(userId, scheduleId);
  return rows.some((en) => {
    if (en.pay_status === "refunded") return false;
    if (en.pay_status === "paid" || en.pay_status === "company_pending") return true;
    return en.status === "joined";
  });
}

function requireAfterTripLottery(userId, scheduleId) {
  if (!eligibleAfterTripLottery(userId, scheduleId)) fail(400, "交费后才能参加行后抽奖");
}

function tripHasEnded(scheduleId) {
  const sch = getDb().prepare("SELECT start_date, end_date FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) fail(404, "行程不存在");
  const end = sch.end_date || sch.start_date;
  return !dayjs(end).isAfter(dayjs(), "day");
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
    campaign_id: campaignId || 0,
    claimed_at: null,
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

function fulfillDraw(userId, prize, times, assignedMeta, deferred) {
  consumeStock(prize);
  if (assignedMeta.assignId) markAssignUsed(assignedMeta.assignId);
  if (!deferred) applyPrize(userId, prize, times);
}

function drawPayload(row, prizes, campaign, extra = {}) {
  const prize = prizes.find((p) => p.key === row.prize_key) || prizeOf(row.prize_key, prizes);
  const spinSeconds = Number(campaign?.spin_seconds || 5);
  const deferred = !!(campaign && Number(campaign.enabled) === 1 && !isThanks(prize));
  return mapDraw(row, {
    prize,
    sectorIndex: sectorIndexOf(prizes, row.prize_key),
    spinSeconds: spinSeconds >= 2 && spinSeconds <= 10 ? spinSeconds : 5,
    rate: rateOf(prize, prizes),
    prizeKind: prize.kind,
    prizePoints: prize.points,
    prizeInfo: prizeInfoOf(prize),
    deferred,
    claimed: deferred ? !!row.claimed_at : true,
    claimHint: deferred
      ? row.claimed_at
        ? "已领取"
        : "跟团结束后才能领奖，先记在本团抽奖里"
      : "",
    ...extra,
  });
}

function drawPre(userId, scheduleId) {
  const sid = Number(scheduleId || 0);
  const { campaign, prizes } = resolvePool(sid);
  const mode = drawModeOf(campaign);
  if (campaign && !allowsPre(mode)) fail(400, "本团是报名后抽奖，请报名后再抽");
  const useCampaign = !!(campaign && Number(campaign.enabled) === 1);
  const storeSid = useCampaign ? sid : 0;
  const exist = useCampaign
    ? getDraw(userId, storeSid, "pre")
    : getDraw(userId, 0, "pre") || getDraw(userId, sid, "pre");
  if (exist) return drawPayload(exist, prizes, campaign, { already: true });

  const picked = choosePrize(userId, prizes, campaign);
  const run = getDb().transaction(() => {
    fulfillDraw(userId, picked.prize, 1, picked, useCampaign && !isThanks(picked.prize));
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
  const { campaign, prizes } = resolvePool(sid);
  const mode = drawModeOf(campaign);
  if (campaign && Number(campaign.enabled) === 1) {
    if (!allowsEnroll(mode)) fail(400, "本团只开放报名前抽奖");
    requireEnrolled(userId, sid);
  } else {
    if (!tripHasEnded(sid)) fail(400, "行程结束后才能抽");
    requireAfterTripLottery(userId, sid);
  }
  const exist = getDraw(userId, sid, "post");
  if (exist) return drawPayload(exist, prizes, campaign, { already: true });

  const picked = choosePrize(userId, prizes, campaign);
  const pre = getDraw(userId, sid, "pre") || getDraw(userId, 0, "pre");
  const doubled = !!(pre && pre.prize_key === picked.prize.key && !isThanks(picked.prize));
  const useCampaign = !!(campaign && Number(campaign.enabled) === 1);
  const run = getDb().transaction(() => {
    fulfillDraw(userId, picked.prize, doubled ? 2 : 1, picked, useCampaign && !isThanks(picked.prize));
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

function claimPrizes(userId, scheduleId) {
  const sid = Number(scheduleId);
  if (!sid) fail(400, "请选择行程");
  requireAfterTripLottery(userId, sid);
  if (!tripHasEnded(sid)) fail(400, "跟团结束后才能领奖");
  const { campaign, prizes } = resolvePool(sid);
  if (!campaign || Number(campaign.enabled) !== 1) fail(400, "本团没有待领奖品");
  const rows = getDb()
    .prepare(
      "SELECT * FROM lottery_draws WHERE user_id=? AND schedule_id=? AND IFNULL(campaign_id,0)=? AND claimed_at IS NULL"
    )
    .all(userId, sid, campaign.id);
  const pending = rows.filter((row) => {
    const prize = prizes.find((p) => p.key === row.prize_key) || prizeOf(row.prize_key, prizes);
    return !isThanks(prize);
  });
  if (!pending.length) fail(400, "没有待领的奖品");
  const run = getDb().transaction(() => {
    const claimed = [];
    pending.forEach((row) => {
      const prize = prizes.find((p) => p.key === row.prize_key) || prizeOf(row.prize_key, prizes);
      const times = row.doubled ? 2 : 1;
      applyPrize(userId, prize, times);
      getDb().prepare("UPDATE lottery_draws SET claimed_at=? WHERE id=?").run(nowText(), row.id);
      claimed.push({
        prizeLabel: prize.label,
        prizeInfo: prizeInfoOf(prize),
        doubled: !!row.doubled,
      });
    });
    return claimed;
  });
  return { claimed: run(), message: "奖品已领取" };
}

function campaignPublic(campaign) {
  const seconds = Number(campaign?.spin_seconds || 5);
  const mode = drawModeOf(campaign);
  return {
    title: (campaign && campaign.title) || "活动抽奖",
    spinSeconds: seconds >= 2 && seconds <= 10 ? seconds : 5,
    enabled: mode !== "off",
    drawMode: mode,
    drawLabel: MODE_LABELS[mode] || "",
    note: (campaign && campaign.note) || "",
  };
}

function canPostDraw(userId, sid, campaign) {
  if (!userId || !sid) return false;
  if (getDraw(userId, sid, "post")) return false;
  const mode = drawModeOf(campaign);
  if (campaign && Number(campaign.enabled) === 1) {
    if (!allowsEnroll(mode)) return false;
    return !!getDb()
      .prepare(
        "SELECT id FROM enrollments WHERE user_id=? AND schedule_id=? AND status IN ('joined','applied','waitlist')"
      )
      .get(userId, sid);
  }
  if (!tripHasEnded(sid)) return false;
  return eligibleAfterTripLottery(userId, sid);
}

function canClaimDraws(userId, sid, campaign, prizes) {
  if (!userId || !sid || !campaign || Number(campaign.enabled) !== 1) return false;
  if (!tripHasEnded(sid)) return false;
  if (!eligibleAfterTripLottery(userId, sid)) return false;
  const pending = getDb()
    .prepare(
      "SELECT prize_key FROM lottery_draws WHERE user_id=? AND schedule_id=? AND IFNULL(campaign_id,0)=? AND claimed_at IS NULL"
    )
    .all(userId, sid, campaign.id);
  return pending.some((row) => {
    const prize = (prizes || []).find((p) => p.key === row.prize_key) || prizeOf(row.prize_key, prizes);
    return !isThanks(prize);
  });
}

function tripResultLine(pre, post) {
  const parts = [pre && pre.prizeLabel, post && post.prizeLabel].filter(Boolean);
  return parts.join(" · ");
}

function listUserLotteryTrips(userId) {
  if (!userId) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.id, s.start_date, r.title AS route_title, c.title AS campaign_title,
              (SELECT MAX(d.id) FROM lottery_draws d WHERE d.user_id=? AND d.schedule_id=s.id) AS last_draw
       FROM schedules s
       JOIN lottery_campaigns c ON c.schedule_id=s.id
       LEFT JOIN routes r ON r.id=s.route_id
       WHERE s.id IN (
         SELECT schedule_id FROM lottery_draws WHERE user_id=? AND IFNULL(schedule_id,0)>0
         UNION
         SELECT c2.schedule_id
         FROM lottery_campaigns c2
         JOIN enrollments e ON e.schedule_id=c2.schedule_id
         WHERE e.user_id=? AND c2.enabled=1 AND e.status IN ('joined','applied','waitlist')
       )
       ORDER BY last_draw IS NULL, last_draw DESC, s.start_date DESC, s.id DESC
       LIMIT 20`
    )
    .all(userId, userId, userId);
  return rows.map((row) => {
    const state = lotteryState(userId, row.id);
    return {
      scheduleId: row.id,
      title: state.title || row.campaign_title || row.route_title || "本团抽奖",
      routeTitle: row.route_title || state.title || "本团",
      startDate: row.start_date || "",
      drawMode: state.drawMode,
      drawLabel: state.drawLabel,
      pre: state.pre,
      post: state.post,
      canPre: state.canPre,
      canPost: state.canPost,
      canClaim: state.canClaim,
      claimHint: state.claimHint,
      resultLabel: tripResultLine(state.pre, state.post),
    };
  });
}

function lotteryState(userId, scheduleId) {
  const sid = Number(scheduleId || 0);
  const { campaign, prizes } = resolvePool(sid);
  const useCampaign = !!(campaign && Number(campaign.enabled) === 1);
  const mode = drawModeOf(campaign);
  const pre = userId
    ? useCampaign
      ? getDraw(userId, sid, "pre")
      : getDraw(userId, sid, "pre") || getDraw(userId, 0, "pre")
    : null;
  const post = userId && sid ? getDraw(userId, sid, "post") : null;
  const canPre = userId
    ? useCampaign
      ? allowsPre(mode) && !getDraw(userId, sid, "pre")
      : !getDraw(userId, 0, "pre") && !getDraw(userId, sid, "pre")
    : false;
  const canClaim = canClaimDraws(userId, sid, campaign, prizes);
  const data = {
    ...campaignPublic(campaign),
    prizes: publicPrizes(prizes),
    pre: pre ? drawPayload(pre, prizes, campaign) : null,
    post: post ? drawPayload(post, prizes, campaign) : null,
    canPre,
    canPost: canPostDraw(userId, sid, campaign),
    canClaim,
    claimHint: useCampaign
      ? canClaim
        ? "跟团已结束，可以领奖"
        : "中奖后先记账，跟团结束后再领奖"
      : "交过费即可在行程结束后抽，不用签到",
  };
  if (!sid) {
    data.title = "平台抽奖";
    data.trips = listUserLotteryTrips(userId);
  }
  return data;
}

module.exports = {
  PRIZES,
  MODE_LABELS,
  pickPrize,
  prizeOf,
  drawPre,
  drawPost,
  claimPrizes,
  lotteryState,
  lotteryPublic,
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
  normalizeDrawMode,
  drawModeOf,
};
