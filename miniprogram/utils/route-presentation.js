const MODE_KEY = "bj_route_view";
const ROUTE_MODES = [
  { key: "poster", label: "大图" },
  { key: "grid", label: "双列" },
  { key: "list", label: "列表" },
];

function normalizeRouteMode(value) {
  return ROUTE_MODES.some((mode) => mode.key === value) ? value : "poster";
}
function readRouteMode() {
  try { return normalizeRouteMode(wx.getStorageSync(MODE_KEY)); }
  catch { return "poster"; }
}
function saveRouteMode(value) {
  const mode = normalizeRouteMode(value);
  try { wx.setStorageSync(MODE_KEY, mode); } catch {}
  return mode;
}
function priceValue(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (value == null || String(value).trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
function routePriceFacts(row = {}) {
  const original = priceValue(row.fromPrice);
  const member = priceValue(row.memberFromPrice);
  // The API derives a zero member price when no price tier exists.
  const unpriced = original == null && Array.isArray(row.priceTiers) && row.priceTiers.length === 0;
  const amount = unpriced ? null : member == null ? original : member;
  return { amount, original: amount != null && original != null && original > amount ? original : null, member: member != null && original != null && member < original };
}
function routeUpcomingFacts(row = {}, now = new Date()) {
  const today = new Date(new Date(now).getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const upcoming = (Array.isArray(row.upcoming) ? row.upcoming : []).filter((item) => {
    if (!item || ["cancelled", "finished", "completed", "ended"].includes(item.status)) return false;
    const date = String(item.startDate || item.start_date || "").slice(0, 10);
    const stamp = Date.parse(date + "T00:00:00Z");
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === date && date >= today;
  }).sort((a, b) => String(a.startDate || a.start_date).localeCompare(String(b.startDate || b.start_date)));
  return { count: upcoming.length, date: upcoming.length ? String(upcoming[0].startDate || upcoming[0].start_date).slice(0, 10) : "" };
}
function decorateRoute(row) {
  row = row || {};
  const price = routePriceFacts(row);
  const upcoming = routeUpcomingFacts(row);
  const source = Array.isArray(row.playTags) && row.playTags.length ? row.playTags : row.tags;
  const tags = Array.from(new Set((Array.isArray(source) ? source : []).map((tag) => typeof tag === "string" ? tag : tag && tag.name).filter(Boolean))).slice(0, 2);
  return Object.assign({}, row, {
    imageBroken: false,
    viewFacts: {
      hasPrice: price.amount != null, price: price.amount, free: price.amount === 0,
      original: price.original, discounted: price.original != null,
      member: price.member,
      days: Number(row.days) > 0 ? Number(row.days) : 1,
      tags, hasSchedule: upcoming.count > 0,
      nextDate: upcoming.date ? upcoming.date.slice(5).replace("-", ".") : "",
    },
  });
}

module.exports = { MODE_KEY, ROUTE_MODES, normalizeRouteMode, readRouteMode, saveRouteMode, routePriceFacts, routeUpcomingFacts, decorateRoute };
