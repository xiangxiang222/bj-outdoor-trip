const dayjs = require("dayjs");
const { getDb } = require("../db");

const SETTING_KEY = "refund_rules";

const DEFAULT_TIERS = Object.freeze([
  Object.freeze({ minDays: 10, percent: 100 }),
  Object.freeze({ minDays: 3, percent: 80 }),
  Object.freeze({ minDays: 0, percent: 50 }),
]);

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function cloneTiers(tiers) {
  return (tiers || []).map((t) => ({ minDays: Number(t.minDays), percent: Number(t.percent) }));
}

function normalizeTiers(input) {
  if (!Array.isArray(input) || !input.length) fail(400, "请至少设置一档退费比例");
  const seen = new Set();
  const tiers = input.map((row) => {
    const minDays = Number(row && row.minDays);
    const percent = Number(row && row.percent);
    if (!Number.isInteger(minDays) || minDays < 0 || minDays > 365) fail(400, "提前天数须为 0～365 的整数");
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) fail(400, "退费比例须为 0～100 的整数");
    if (seen.has(minDays)) fail(400, "提前天数不能重复");
    seen.add(minDays);
    return { minDays, percent };
  });
  if (!tiers.some((t) => t.minDays === 0)) fail(400, "请增加一档提前 0 天，用于出发当天尚未正式开团的退费比例");
  return tiers.sort((a, b) => b.minDays - a.minDays);
}

function parseStoredRules(raw) {
  if (raw == null || raw === "") return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const tiers = Array.isArray(parsed) ? parsed : parsed && parsed.tiers;
    return { tiers: normalizeTiers(tiers) };
  } catch (e) {
    if (e.status) return null;
    return null;
  }
}

function remainingDays(startDate, now = dayjs()) {
  const start = dayjs(startDate).startOf("day");
  if (!start.isValid()) return NaN;
  return start.diff(dayjs(now).startOf("day"), "day");
}

function matchPercent(tiers, daysLeft, { startedAt } = {}) {
  if (startedAt) return 0;
  if (!Number.isFinite(daysLeft) || daysLeft < 0) return 0;
  const sorted = cloneTiers(tiers).sort((a, b) => b.minDays - a.minDays);
  for (const t of sorted) {
    if (daysLeft >= t.minDays) return t.percent;
  }
  return 0;
}

function refundAmount(payAmount, percent) {
  const paid = Number(payAmount) || 0;
  const pct = Number(percent) || 0;
  if (paid <= 0 || pct <= 0) return 0;
  return Math.floor((paid * pct) / 100);
}

function lineText(tier, higher) {
  if (!higher) return `出发前 ${tier.minDays} 天及以上：退 ${tier.percent}%`;
  if (tier.minDays <= 0) return `出发前不足 ${higher.minDays} 天（含出发当天未正式开团）：退 ${tier.percent}%`;
  return `出发前 ${tier.minDays} 天及以上：退 ${tier.percent}%`;
}

function proportionLines(tiers) {
  const sorted = cloneTiers(tiers).sort((a, b) => b.minDays - a.minDays);
  const lines = sorted.map((t, i) => ({
    minDays: t.minDays,
    percent: t.percent,
    text: lineText(t, sorted[i - 1]),
  }));
  lines.push({ minDays: null, percent: 0, text: "正式开团后：不退费" });
  return lines;
}

function extraCancelItems() {
  return [
    "发起人或平台解散拼团：全部报名取消，已付款按全额标记退款。",
    "天气、景区封山等不可抗力导致无法出行时，由发起人解散或改期，已收款按解散规则处理。",
    "候补未递补前取消，不影响在团人数。已付款按当时比例记退款（演示环境为标记，未对接微信原路退款）。",
  ];
}

function summaryOf(tiers) {
  const sorted = cloneTiers(tiers).sort((a, b) => b.minDays - a.minDays);
  const parts = sorted.map((t, i) => {
    if (i === 0) return `${t.minDays} 天前退 ${t.percent}%`;
    if (t.minDays <= 0) return `不足 ${sorted[i - 1].minDays} 天退 ${t.percent}%`;
    return `${t.minDays} 天前退 ${t.percent}%`;
  });
  return `按距出发日比例退费：${parts.join("，")}；正式开团后不退费。`;
}

function policyCopy(tiers) {
  const lines = proportionLines(tiers);
  return {
    title: "退改说明",
    summary: summaryOf(tiers),
    lines,
    items: [...lines.map((l) => l.text), ...extraCancelItems()],
  };
}

function getGlobalRefundRules() {
  const row = getDb().prepare("SELECT value FROM settings WHERE key=?").get(SETTING_KEY);
  const stored = parseStoredRules(row && row.value);
  if (stored) return { source: "global", tiers: stored.tiers };
  return { source: "default", tiers: cloneTiers(DEFAULT_TIERS) };
}

function saveGlobalRefundRules(tiers) {
  const normalized = normalizeTiers(tiers);
  const json = JSON.stringify({ tiers: normalized });
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    )
    .run(SETTING_KEY, json);
  return { source: "global", tiers: normalized };
}

function rulesOfRoute(routeRow) {
  const stored = parseStoredRules(routeRow && routeRow.refund_rules_json);
  if (stored) return { source: "route", tiers: stored.tiers };
  return getGlobalRefundRules();
}

function refundPolicyView(routeRow, schedule) {
  const rules = routeRow ? rulesOfRoute(routeRow) : getGlobalRefundRules();
  const copy = policyCopy(rules.tiers);
  const view = {
    source: rules.source,
    useGlobal: rules.source !== "route",
    tiers: rules.tiers,
    title: copy.title,
    summary: copy.summary,
    lines: copy.lines,
    items: copy.items,
  };
  if (schedule) {
    const quote = cancelQuote(
      { status: "joined", pay_status: "unpaid", pay_amount: 0 },
      {
        status: schedule.status,
        startDate: schedule.start_date || schedule.startDate,
        startedAt: schedule.started_at || schedule.startedAt,
        channel: schedule.channel || "trip",
        tiers: rules.tiers,
      }
    );
    view.current = {
      remainingDays: quote.remainingDays,
      percent: quote.percent,
      started: !!quote.started,
      canCancel: quote.canCancel,
      hint: quote.hint,
    };
  }
  return view;
}

function withRefundCommonRules(commonRules, policy) {
  const items = (policy && policy.items) || extraCancelItems();
  return {
    ...commonRules,
    sections: (commonRules.sections || []).map((s) => (s.title === "退改" ? { ...s, items } : s)),
  };
}

function scheduleLike(sch) {
  if (!sch) return { status: "", startDate: "", startedAt: "", channel: "trip", tiers: cloneTiers(DEFAULT_TIERS) };
  const channel = sch.channel || "trip";
  const startDate = sch.startDate || sch.start_date;
  const startedAt = sch.startedAt || sch.started_at || "";
  const status = sch.status || sch.schedule_status || "";
  let tiers = sch.tiers;
  if (!tiers) {
    if (sch.refundRulesJson || sch.refund_rules_json) {
      const stored = parseStoredRules(sch.refundRulesJson || sch.refund_rules_json);
      tiers = stored ? stored.tiers : getGlobalRefundRules().tiers;
    } else if (sch.route) {
      tiers = rulesOfRoute(sch.route).tiers;
    } else {
      tiers = getGlobalRefundRules().tiers;
    }
  }
  return { status, startDate, startedAt, channel, tiers };
}

function cancelQuote(en, sch) {
  const schedule = scheduleLike(sch);
  const remaining = remainingDays(schedule.startDate);
  const started = !!schedule.startedAt;
  if (!en || en.status === "cancelled") {
    return { canCancel: false, percent: 0, remainingDays: remaining, started, amount: 0, hint: "该报名已取消" };
  }
  if (schedule.status === "cancelled") {
    return { canCancel: false, percent: 0, remainingDays: remaining, started, amount: 0, hint: "拼团已解散" };
  }
  if (schedule.channel === "activity") {
    const ok = dayjs(schedule.startDate).isAfter(dayjs(), "day");
    return {
      canCancel: ok,
      percent: ok ? 100 : 0,
      remainingDays: remaining,
      started: false,
      amount: 0,
      hint: ok ? "出发日前可取消" : "出发当天及之后不可取消",
    };
  }
  if (started) {
    return { canCancel: false, percent: 0, remainingDays: remaining, started: true, amount: 0, hint: "正式开团后不可取消" };
  }
  if (!Number.isFinite(remaining) || remaining < 0) {
    return { canCancel: false, percent: 0, remainingDays: remaining, started: false, amount: 0, hint: "已过出发日，不可取消" };
  }
  const percent = matchPercent(schedule.tiers, remaining);
  const paid = en.pay_status === "paid" && Number(en.pay_amount || 0) > 0;
  if (paid && percent <= 0) {
    return {
      canCancel: false,
      percent: 0,
      remainingDays: remaining,
      started: false,
      amount: 0,
      hint: "当前时段不退费，无法取消",
    };
  }
  const amount = paid ? refundAmount(en.pay_amount, percent) : 0;
  const hint = paid
    ? `现在取消可退 ${percent}%（¥${amount}）`
    : remaining === 0
      ? `出发当天尚未正式开团，取消可退 ${percent}%`
      : `距出发还有 ${remaining} 天，取消可退 ${percent}%`;
  return { canCancel: true, percent, remainingDays: remaining, started: false, amount, hint };
}

function applyRouteRefundRules(routeId, body, { updating } = {}) {
  const b = body || {};
  if (updating && b.refundUseGlobal == null && !Array.isArray(b.refundTiers)) return;
  let json = null;
  if (b.refundUseGlobal === true) {
    json = null;
  } else if (b.refundUseGlobal === false || Array.isArray(b.refundTiers)) {
    json = JSON.stringify({ tiers: normalizeTiers(b.refundTiers) });
  }
  getDb().prepare("UPDATE routes SET refund_rules_json=? WHERE id=?").run(json, routeId);
}

module.exports = {
  SETTING_KEY,
  DEFAULT_TIERS,
  cloneTiers,
  normalizeTiers,
  parseStoredRules,
  remainingDays,
  matchPercent,
  refundAmount,
  proportionLines,
  policyCopy,
  getGlobalRefundRules,
  saveGlobalRefundRules,
  rulesOfRoute,
  refundPolicyView,
  withRefundCommonRules,
  cancelQuote,
  applyRouteRefundRules,
};
