function visitorId() {
  try {
    let id = wx.getStorageSync("bj_visitor_id");
    if (id && /^[A-Za-z0-9_-]{8,64}$/.test(id)) return id;
    id = "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    wx.setStorageSync("bj_visitor_id", id);
    return id;
  } catch (err) {
    return "anon0001";
  }
}

function pulsePath(item) {
  if (!item) return "";
  if (item.scheduleId && (item.kind === "enroll" || item.kind === "open")) {
    return "/pages/schedule/schedule?id=" + item.scheduleId;
  }
  if (item.routeId) return "/pkg-detail/detail/detail?id=" + item.routeId;
  return "";
}

function pulseFace(who) {
  const s = String(who || "").replace(/\*/g, "").trim();
  return s.slice(0, 1) || "同";
}

module.exports = { visitorId, pulsePath, pulseFace };
