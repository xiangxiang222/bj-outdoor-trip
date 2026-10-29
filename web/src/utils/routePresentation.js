export const ROUTE_MODES = [
  { key: "poster", label: "大图" },
  { key: "grid", label: "双列" },
  { key: "list", label: "列表" },
];

export function normalizeRouteMode(value) {
  return ROUTE_MODES.some((mode) => mode.key === value) ? value : "poster";
}

function priceValue(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (value == null || String(value).trim() === "") return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function routePriceFacts(route = {}) {
  const original = priceValue(route.fromPrice);
  const member = priceValue(route.memberFromPrice);
  // The API derives a zero member price when no price tier exists.
  const unpriced = original == null && Array.isArray(route.priceTiers) && route.priceTiers.length === 0;
  const amount = unpriced ? null : member ?? original;
  return { amount, original: amount != null && original != null && original > amount ? original : null, member: member != null && original != null && member < original };
}

export function routeUpcomingFacts(route = {}, now = new Date()) {
  const today = new Date(new Date(now).getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const upcoming = (Array.isArray(route.upcoming) ? route.upcoming : []).filter((row) => {
    if (!row) return false;
    const date = String(row.startDate || row.start_date || "").slice(0, 10);
    const stamp = Date.parse(date + "T00:00:00Z");
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === date && date >= today && !["cancelled", "finished", "completed", "ended"].includes(row.status);
  }).sort((a, b) => String(a.startDate || a.start_date).localeCompare(String(b.startDate || b.start_date)));
  return { count: upcoming.length, date: upcoming.length ? String(upcoming[0].startDate || upcoming[0].start_date).slice(0, 10) : "" };
}

export function routeLabels(route = {}) {
  const source = Array.isArray(route.playTags) && route.playTags.length ? route.playTags : route.tags;
  return [...new Set((Array.isArray(source) ? source : []).map((tag) => typeof tag === "string" ? tag : tag && tag.name).filter(Boolean))].slice(0, 3);
}
