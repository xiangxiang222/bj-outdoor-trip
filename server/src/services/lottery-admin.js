const { getDb } = require("../db");
const {
  defaultPool,
  getCampaignBySchedule,
  listPrizeRows,
  mapPrizeRow,
  isThanks,
  normalizeDrawMode,
} = require("./lottery");

const LAUNCH_PRIZES = [
  { name: "一等奖", level: 1, kind: "physical", weight: 5, stock: 1, color: "#e1251b" },
  { name: "二等奖", level: 2, kind: "points", points: 50, weight: 15, stock: -1, color: "#f5a623" },
  { name: "三等奖", level: 3, kind: "points", points: 20, weight: 25, stock: -1, color: "#7cb342", prizeKey: "points20" },
  { name: "谢谢参与", level: 9, kind: "thanks", weight: 55, stock: -1, color: "#c8ccc4", prizeKey: "thanks" },
];

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

const KINDS = new Set(["points", "physical", "coupon", "thanks"]);
const COLORS = ["#e1251b", "#f5a623", "#7cb342", "#42a5f5", "#26a69a", "#8e24aa", "#c8ccc4"];

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function mapAdminPrize(row, totalWeight) {
  const prize = mapPrizeRow(row);
  const weight = Number(prize.weight || 0);
  return {
    ...prize,
    remain: Number(prize.stock) < 0 ? -1 : Math.max(0, Number(prize.stock) - Number(prize.stockUsed)),
    rate: totalWeight > 0 ? Math.round((weight / totalWeight) * 1000) / 10 : 0,
  };
}

function enrolledUsers(scheduleId) {
  return getDb()
    .prepare(
      `SELECT u.id, u.nickname, u.phone
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
       WHERE e.schedule_id=? AND e.status IN ('joined','applied','waitlist')
         AND IFNULL(u.is_virtual,0)=0 AND u.deleted_at IS NULL
       ORDER BY e.id ASC`
    )
    .all(scheduleId);
}

function listAssigns(campaignId) {
  return getDb()
    .prepare(
      `SELECT a.*, u.nickname, u.phone, p.name AS prize_name, p.level AS prize_level
       FROM lottery_assigns a
       JOIN users u ON u.id = a.user_id
       JOIN lottery_prizes p ON p.id = a.prize_id
       WHERE a.campaign_id=?
       ORDER BY a.id DESC`
    )
    .all(campaignId)
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      nickname: row.nickname,
      phone: row.phone,
      prizeId: row.prize_id,
      prizeName: row.prize_name,
      level: row.prize_level,
      note: row.note || "",
      usedAt: row.used_at || "",
      createdAt: row.created_at,
    }));
}

function listDraws(scheduleId, campaignId) {
  return getDb()
    .prepare(
      `SELECT d.*, u.nickname, u.phone
       FROM lottery_draws d
       JOIN users u ON u.id = d.user_id
       WHERE d.schedule_id=? OR (d.campaign_id!=0 AND d.campaign_id=?)
       ORDER BY d.id DESC
       LIMIT 200`
    )
    .all(scheduleId, campaignId || 0)
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      nickname: row.nickname,
      phone: row.phone,
      phase: row.phase,
      prizeKey: row.prize_key,
      prizeLabel: row.prize_label,
      level: Number(row.level || 0),
      doubled: !!row.doubled,
      assigned: !!row.assigned,
      claimed: !!row.claimed_at,
      createdAt: row.created_at,
    }));
}

const MODE_TEXT = {
  off: "未开",
  pre: "报名前",
  enroll: "报名后",
  both: "前后都抽",
};

function listAdminLotteries() {
  const rows = getDb()
    .prepare(
      `SELECT s.id AS schedule_id, s.start_date, s.status, IFNULL(s.channel,'trip') AS channel,
              r.title AS route_title,
              c.id AS campaign_id, c.enabled, c.title, c.draw_mode, c.updated_at
       FROM schedules s
       LEFT JOIN routes r ON r.id = s.route_id
       LEFT JOIN lottery_campaigns c ON c.schedule_id = s.id
       ORDER BY CASE WHEN s.status='cancelled' THEN 1 ELSE 0 END, s.start_date DESC, s.id DESC`
    )
    .all();
  return rows.map((row) => {
    const configured = !!row.campaign_id;
    const enabled = configured && Number(row.enabled) === 1;
    const drawMode = enabled ? normalizeDrawMode(row.draw_mode) || "both" : "off";
    return {
      scheduleId: row.schedule_id,
      routeTitle: row.route_title || "",
      startDate: row.start_date || "",
      status: row.status,
      channel: row.channel || "trip",
      campaignId: row.campaign_id || 0,
      enabled,
      configured,
      title: row.title || "",
      drawMode,
      drawLabel: !configured ? "未配置" : enabled ? MODE_TEXT[drawMode] || "已开" : "已关闭",
      updatedAt: row.updated_at || "",
    };
  });
}

function getAdminLottery(scheduleId) {
  const sid = Number(scheduleId);
  if (!sid) fail(400, "请选择行程");
  const sch = getDb().prepare("SELECT id FROM schedules WHERE id=?").get(sid);
  if (!sch) fail(404, "行程不存在");
  const campaign = getCampaignBySchedule(sid);
  const rows = campaign ? listPrizeRows(campaign.id) : [];
  const source = rows.length ? rows.map(mapPrizeRow) : defaultPool();
  const totalWeight = source.reduce((sum, p) => sum + Number(p.weight || 0), 0);
  const prizes = rows.length
    ? rows.map((row) => mapAdminPrize(row, totalWeight))
    : source.map((p, i) => ({
        ...p,
        color: p.color || COLORS[i % COLORS.length],
        remain: -1,
        rate: totalWeight > 0 ? Math.round((Number(p.weight || 0) / totalWeight) * 1000) / 10 : 0,
      }));
  return {
    scheduleId: sid,
    enabled: !!(campaign && Number(campaign.enabled) === 1),
    drawMode: campaign ? normalizeDrawMode(campaign.draw_mode) || "both" : "both",
    title: campaign?.title || "本团抽奖",
    spinSeconds: Number(campaign?.spin_seconds || 5),
    note: campaign?.note || "",
    prizes,
    assigns: campaign ? listAssigns(campaign.id) : [],
    draws: listDraws(sid, campaign?.id),
    enrolled: enrolledUsers(sid),
  };
}

function normalizePrize(input, index) {
  const name = String(input.name || input.label || "").trim();
  if (!name) fail(400, `第 ${index + 1} 个奖品请填写名称`);
  const kind = KINDS.has(input.kind) ? input.kind : Number(input.points) > 0 ? "points" : "thanks";
  const level = clampInt(input.level, 1, 9, kind === "thanks" ? 9 : 4);
  return {
    id: Number(input.id || 0),
    name,
    prizeKey: String(input.prizeKey || input.key || "").trim(),
    level,
    kind: isThanks({ kind, key: input.prizeKey, level }) ? "thanks" : kind,
    points: clampInt(input.points, 0, 100000, 0),
    weight: clampInt(input.weight, 0, 10000, 0),
    stock: input.stock === "" || input.stock == null ? -1 : clampInt(input.stock, -1, 100000, -1),
    color: String(input.color || COLORS[index % COLORS.length]).slice(0, 20),
    couponCampaignId: clampInt(input.couponCampaignId || input.coupon_campaign_id, 0, 1e9, 0),
    sort: clampInt(input.sort ?? index, 0, 99, index),
  };
}

function saveAdminLottery(scheduleId, body = {}) {
  const sid = Number(scheduleId);
  if (!sid) fail(400, "请选择行程");
  const sch = getDb().prepare("SELECT id FROM schedules WHERE id=?").get(sid);
  if (!sch) fail(404, "行程不存在");
  const prizes = Array.isArray(body.prizes) ? body.prizes.map((p, i) => normalizePrize(p, i)) : [];
  if (prizes.length < 2 || prizes.length > 8) fail(400, "奖品请设 2～8 个，圆盘才好看");
  if (!prizes.some((p) => p.weight > 0)) fail(400, "至少有一个奖品的中奖权重大于 0");
  let drawMode = normalizeDrawMode(body.drawMode || body.draw_mode || body.lotteryMode) || "both";
  let enabled = body.enabled === false || body.enabled === 0 || body.enabled === "0" ? 0 : 1;
  if (drawMode === "off") enabled = 0;
  if (!enabled) drawMode = normalizeDrawMode(body.drawMode || body.draw_mode) === "off" ? "off" : drawMode;
  const title = String(body.title || "本团抽奖").trim().slice(0, 40) || "本团抽奖";
  const spinSeconds = clampInt(body.spinSeconds ?? body.spin_seconds, 2, 10, 5);
  const note = String(body.note || "").trim().slice(0, 200);

  const db = getDb();
  const run = db.transaction(() => {
    let campaign = db.prepare("SELECT * FROM lottery_campaigns WHERE schedule_id=?").get(sid);
    if (!campaign) {
      const info = db
        .prepare(
          "INSERT INTO lottery_campaigns (schedule_id,enabled,title,spin_seconds,note,draw_mode,updated_at) VALUES (?,?,?,?,?,?,datetime('now','localtime'))"
        )
        .run(sid, enabled, title, spinSeconds, note, drawMode === "off" ? "both" : drawMode);
      campaign = db.prepare("SELECT * FROM lottery_campaigns WHERE id=?").get(info.lastInsertRowid);
    } else {
      db.prepare(
        "UPDATE lottery_campaigns SET enabled=?, title=?, spin_seconds=?, note=?, draw_mode=?, updated_at=datetime('now','localtime') WHERE id=?"
      ).run(enabled, title, spinSeconds, note, drawMode === "off" ? campaign.draw_mode || "both" : drawMode, campaign.id);
    }
    const keepIds = [];
    prizes.forEach((prize, i) => {
      if (prize.id) {
        const exist = db.prepare("SELECT * FROM lottery_prizes WHERE id=? AND campaign_id=?").get(prize.id, campaign.id);
        if (exist) {
          db.prepare(
            `UPDATE lottery_prizes SET sort_order=?, name=?, prize_key=?, level=?, kind=?, points=?, weight=?, stock=?, color=?, coupon_campaign_id=?
             WHERE id=?`
          ).run(
            i,
            prize.name,
            prize.prizeKey || exist.prize_key || `p${exist.id}`,
            prize.level,
            prize.kind,
            prize.points,
            prize.weight,
            prize.stock,
            prize.color,
            prize.couponCampaignId,
            exist.id
          );
          keepIds.push(exist.id);
          return;
        }
      }
      const info = db
        .prepare(
          `INSERT INTO lottery_prizes (campaign_id,sort_order,name,prize_key,level,kind,points,weight,stock,stock_used,color,coupon_campaign_id)
           VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`
        )
        .run(
          campaign.id,
          i,
          prize.name,
          prize.prizeKey || "",
          prize.level,
          prize.kind,
          prize.points,
          prize.weight,
          prize.stock,
          prize.color,
          prize.couponCampaignId
        );
      const id = Number(info.lastInsertRowid);
      if (!prize.prizeKey) db.prepare("UPDATE lottery_prizes SET prize_key=? WHERE id=?").run(`p${id}`, id);
      keepIds.push(id);
    });
    const stale = db
      .prepare(`SELECT id FROM lottery_prizes WHERE campaign_id=? AND id NOT IN (${keepIds.map(() => "?").join(",")})`)
      .all(campaign.id, ...keepIds);
    stale.forEach((row) => {
      db.prepare("DELETE FROM lottery_assigns WHERE prize_id=? AND used_at IS NULL").run(row.id);
      db.prepare("DELETE FROM lottery_prizes WHERE id=?").run(row.id);
    });
    return campaign.id;
  });
  run();
  return getAdminLottery(sid);
}

function findUser(body = {}) {
  const db = getDb();
  if (body.userId || body.user_id) {
    const user = db.prepare("SELECT * FROM users WHERE id=? AND deleted_at IS NULL").get(Number(body.userId || body.user_id));
    if (!user) fail(404, "用户不存在");
    return user;
  }
  const phone = String(body.phone || "").trim();
  if (!/^1\d{10}$/.test(phone)) fail(400, "请填写用户或 11 位手机号");
  const user = db.prepare("SELECT * FROM users WHERE phone=? AND deleted_at IS NULL").get(phone);
  if (!user) fail(404, "该手机号还没有注册");
  return user;
}

function addAssign(scheduleId, body = {}, adminId) {
  const data = getAdminLottery(scheduleId);
  const campaign = getCampaignBySchedule(scheduleId);
  if (!campaign) fail(400, "请先保存本团奖品");
  const user = findUser(body);
  const prizeId = Number(body.prizeId || body.prize_id);
  const prize = data.prizes.find((p) => Number(p.id) === prizeId);
  if (!prize || !prize.id) fail(400, "请选择要指定的奖品");
  const note = String(body.note || "").trim().slice(0, 80);
  const db = getDb();
  const exist = db.prepare("SELECT * FROM lottery_assigns WHERE campaign_id=? AND user_id=?").get(campaign.id, user.id);
  if (exist && exist.used_at) fail(400, "该用户已经按指定结果抽过了");
  if (exist) {
    db.prepare("UPDATE lottery_assigns SET prize_id=?, note=?, created_by=? WHERE id=?").run(prize.id, note, adminId || 0, exist.id);
  } else {
    try {
      db.prepare(
        "INSERT INTO lottery_assigns (campaign_id,prize_id,user_id,note,created_by) VALUES (?,?,?,?,?)"
      ).run(campaign.id, prize.id, user.id, note, adminId || 0);
    } catch (e) {
      if (String(e.message || "").includes("UNIQUE")) fail(400, "该用户已有指定");
      throw e;
    }
  }
  return getAdminLottery(scheduleId);
}

function removeAssign(scheduleId, assignId) {
  const campaign = getCampaignBySchedule(scheduleId);
  if (!campaign) fail(404, "抽奖未配置");
  const row = getDb().prepare("SELECT * FROM lottery_assigns WHERE id=? AND campaign_id=?").get(Number(assignId), campaign.id);
  if (!row) fail(404, "指定记录不存在");
  if (row.used_at) fail(400, "已经抽过，不能删");
  getDb().prepare("DELETE FROM lottery_assigns WHERE id=?").run(row.id);
  return getAdminLottery(scheduleId);
}

function attachLotteryOnCreate(scheduleId, body = {}) {
  const mode = normalizeDrawMode(body.lotteryMode || body.lottery_mode || body.drawMode || body.draw_mode);
  if (!mode || mode === "off") return null;
  return saveAdminLottery(scheduleId, {
    enabled: true,
    drawMode: mode,
    title: "本团抽奖",
    spinSeconds: 5,
    prizes: LAUNCH_PRIZES,
  });
}

module.exports = {
  getAdminLottery,
  listAdminLotteries,
  saveAdminLottery,
  addAssign,
  removeAssign,
  attachLotteryOnCreate,
  LAUNCH_PRIZES,
};
