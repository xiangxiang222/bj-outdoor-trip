const dayjs = require("dayjs");
const { getDb } = require("../db");

const LEVELS = [
  { level: 1, code: "V1", name: "注册会员", growth: 0, rate: 1, pointsBonus: 1, perks: ["出行累计成长值", "报名按公布价"] },
  { level: 2, code: "V2", name: "银卡会员", growth: 500, rate: 0.98, pointsBonus: 1.05, perks: ["团费 98 折", "积分 1.05 倍"] },
  { level: 3, code: "V3", name: "金卡会员", growth: 2000, rate: 0.95, pointsBonus: 1.1, perks: ["团费 95 折", "积分 1.1 倍"] },
  { level: 4, code: "V4", name: "钻石会员", growth: 8000, rate: 0.92, pointsBonus: 1.2, perks: ["团费 92 折", "积分 1.2 倍"] },
  { level: 5, code: "V5", name: "至尊会员", growth: 20000, rate: 0.9, pointsBonus: 1.3, perks: ["团费 9 折", "积分 1.3 倍"] },
];

function levelByNumber(n) {
  return LEVELS.find((item) => item.level === Number(n)) || LEVELS[0];
}

function levelFromGrowth(growth) {
  let current = LEVELS[0];
  for (const item of LEVELS) {
    if (Number(growth || 0) >= item.growth) current = item;
  }
  return current;
}

function legacySilver(user) {
  if (!user || !user.is_member) return false;
  if (!user.member_expire_at) return true;
  return !dayjs(user.member_expire_at).isBefore(dayjs(), "day");
}

function growthOf(userId) {
  if (!userId) return 0;
  const row = getDb()
    .prepare("SELECT IFNULL(SUM(delta),0) AS s FROM points_ledger WHERE user_id=? AND ref_type='enrollment'")
    .get(userId);
  return Math.max(0, Number(row?.s || 0));
}

function monthGrowthOf(userId) {
  if (!userId) return 0;
  const row = getDb()
    .prepare(
      `SELECT IFNULL(SUM(delta),0) AS s FROM points_ledger
       WHERE user_id=? AND ref_type='enrollment' AND created_at>=datetime('now','localtime','start of month')`
    )
    .get(userId);
  return Math.max(0, Number(row?.s || 0));
}

function memberState(user) {
  const growth = user && user.id ? growthOf(user.id) : Math.max(0, Number(user && user.growth) || 0);
  const earned = levelFromGrowth(growth);
  const manual = Number(user && user.member_level) || 0;
  let current = earned;
  let manualSet = false;
  if (manual >= 1 && manual <= 5) {
    current = levelByNumber(manual);
    manualSet = true;
  } else if (legacySilver(user) && earned.level < 2) {
    current = levelByNumber(2);
  }
  const next = LEVELS.find((item) => item.level === current.level + 1) || null;
  const span = next ? next.growth - current.growth : 1;
  const into = next ? Math.max(0, growth - current.growth) : span;
  const progress = next ? Math.min(1, into / span) : 1;
  return {
    level: current.level,
    code: current.code,
    name: current.name,
    rate: current.rate,
    pointsBonus: current.pointsBonus,
    perks: current.perks,
    growth,
    monthGrowth: user && user.id ? monthGrowthOf(user.id) : 0,
    nextGrowth: next ? next.growth : current.growth,
    nextCode: next ? next.code : "",
    nextName: next ? next.name : "",
    progress,
    manual: manualSet,
    levels: LEVELS.map((item) => ({
      level: item.level,
      code: item.code,
      name: item.name,
      growth: item.growth,
      rate: item.rate,
      perks: item.perks,
      reached: growth >= item.growth || current.level >= item.level,
      current: item.level === current.level,
    })),
  };
}

function setMemberLevel(userId, level) {
  const n = Number(level);
  if (!LEVELS.some((item) => item.level === n)) {
    const err = new Error("请选择 V1 到 V5");
    err.status = 400;
    throw err;
  }
  getDb().prepare("UPDATE users SET member_level=? WHERE id=?").run(n, userId);
  return getDb().prepare("SELECT * FROM users WHERE id=?").get(userId);
}

module.exports = { LEVELS, levelFromGrowth, memberState, setMemberLevel, growthOf };
