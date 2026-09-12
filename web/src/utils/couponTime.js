export function parseCouponStamp(value, endOfDay = false) {
  const raw = String(value || "").trim();
  if (!raw) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T${endOfDay ? "23:59:59" : "00:00:00"}`).getTime();
  }
  const stamp = new Date(raw.includes("T") ? raw : raw.replace(" ", "T")).getTime();
  return Number.isFinite(stamp) ? stamp : NaN;
}

export function formatRemain(ms) {
  if (ms <= 0) return "已过期";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `剩 ${days} 天 ${hours} 小时`;
  if (hours > 0) return `剩 ${hours} 小时 ${mins} 分`;
  if (mins > 0) return `剩 ${mins} 分`;
  return `剩 ${s} 秒`;
}

export function couponCountdown(row, now = Date.now()) {
  if (!row) return null;
  const end =
    parseCouponStamp(row.expiresAt || row.expires_at, false) ||
    parseCouponStamp(row.useEnd || row.use_end, true);
  if (!end) return null;
  const claimed = parseCouponStamp(row.claimedAt || row.claimed_at || row.createdAt, false);
  const hours = Number(row.validHours || row.valid_hours || 0);
  let start = claimed;
  if (!start && hours > 0) start = end - hours * 3600 * 1000;
  if (!start) start = end - 24 * 3600 * 1000;
  const total = Math.max(1, end - start);
  const remain = Math.max(0, end - now);
  const ratio = Math.min(1, remain / total);
  return {
    remainMs: remain,
    totalMs: total,
    ratio,
    percent: Math.round(ratio * 100),
    expired: remain <= 0,
    label: formatRemain(remain),
  };
}

export function unusedCoupons(rows, now = Date.now()) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (row.status !== "unused") return false;
    const clock = couponCountdown(row, now);
    return !clock || !clock.expired;
  });
}
