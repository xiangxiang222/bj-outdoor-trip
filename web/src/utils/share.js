export function isWeChatWebView(ua = "") {
  return /MicroMessenger/i.test(String(ua || ""));
}

export function nativeShareSupported(nav) {
  if (!nav || typeof nav.share !== "function") return false;
  if (isWeChatWebView(nav.userAgent)) return false;
  return true;
}

export function scheduleShareUrl(origin, id, token, joinCode, ref) {
  const extra = token && typeof token === "object" ? token : { token, joinCode, ref };
  const base = `${String(origin || "").replace(/\/$/, "")}/m/schedule/${id}`;
  const q = new URLSearchParams();
  const t = String(extra.token || "").trim();
  if (t) q.set("token", t);
  const code = String(extra.joinCode || "").trim();
  if (code) q.set("joinCode", code);
  const r = String(extra.ref || "").trim();
  if (r) q.set("ref", r);
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}

export function scheduleShareText({ organizerName, title, startDate, enrolled, url, joinCode }) {
  const code = String(joinCode || "").trim();
  const lock = code ? ` 入团口令 ${code}` : "";
  return `${organizerName || "同行者众"}邀请你参加「${title || "行程"}」${startDate || ""}出发，已有${enrolled || 0}人报名：${url}${lock}`;
}

export function douyinShareText({ organizerName, title, startDate, enrolled, url, joinCode }) {
  const who = organizerName || "同行者众";
  const when = startDate ? `${startDate}出发，` : "";
  const lock = String(joinCode || "").trim() ? `\n入团口令 ${String(joinCode).trim()}` : "";
  return `${who}邀你报名「${title || "行程"}」
${when}已有${enrolled || 0}人
报名：${url}${lock}
#同行者众 #北京周边游 #户外`;
}

export function payShareUrl(origin, token) {
  const t = String(token || "").trim();
  return `${String(origin || "").replace(/\/$/, "")}/m/pay/${encodeURIComponent(t)}`;
}

export function payShareText({ travelerName, title, remainAmount, url }) {
  const who = travelerName || "同行";
  return `${who}的「${title || "行程"}」团费还差 ¥${Number(remainAmount) || 0}，可代付全款或分摊一部分：${url}`;
}
