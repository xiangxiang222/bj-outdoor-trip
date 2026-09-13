const KEY = "bj_visitor_id";

export function visitorId() {
  if (typeof localStorage === "undefined") return "anon0001";
  try {
    let id = localStorage.getItem(KEY);
    if (id && /^[A-Za-z0-9_-]{8,64}$/.test(id)) return id;
    const raw = globalThis.crypto?.randomUUID?.() || `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    id = String(raw).replace(/-/g, "").slice(0, 32);
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return "anon0001";
  }
}

export function pulsePath(item) {
  if (!item) return "";
  if (item.scheduleId && (item.kind === "enroll" || item.kind === "open")) {
    return `/m/schedule/${item.scheduleId}`;
  }
  if (item.routeId) return `/m/route/${item.routeId}`;
  return item.href || "";
}

export function pulseFace(who) {
  const s = String(who || "").replace(/\*/g, "").trim();
  return s.slice(0, 1) || "同";
}
