export function isWeChatWebView(ua = "") {
  return /MicroMessenger/i.test(String(ua || ""));
}

export function nativeShareSupported(nav) {
  if (!nav || typeof nav.share !== "function") return false;
  if (isWeChatWebView(nav.userAgent)) return false;
  return true;
}

export function scheduleShareUrl(origin, id, token) {
  const base = `${String(origin || "").replace(/\/$/, "")}/m/schedule/${id}`;
  const t = String(token || "").trim();
  return t ? `${base}?token=${encodeURIComponent(t)}` : base;
}

export function scheduleShareText({ organizerName, title, startDate, enrolled, url }) {
  return `${organizerName || "同行者众"}邀请你参加「${title || "行程"}」${startDate || ""}出发，已有${enrolled || 0}人报名：${url}`;
}
