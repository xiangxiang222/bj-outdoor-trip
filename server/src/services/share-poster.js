const QRCode = require("qrcode");
const { getDb, toRoute } = require("../db");
const config = require("../config");
const { enrolledCount, quoteForSchedule, attachAssetHost, publicBase } = require("./helpers");
const { ensureReferralCode } = require("./profile");
const { tripKindOf } = require("./official-trip");
const { loginLive, getWxaCode } = require("./wechat");

function escapeXml(raw) {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function encodeShareScene({ id, ref, joinCode }) {
  const bits = [`i${id}`];
  const code = String(ref || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12);
  if (code) bits.push(`r${code}`);
  const lock = String(joinCode || "").trim();
  if (lock && !/[^\w]/.test(lock)) bits.push(`c${lock.slice(0, 8)}`);
  return bits.join(".").slice(0, 32);
}

function decodeShareScene(scene) {
  const out = { id: "", ref: "", joinCode: "" };
  String(scene || "")
    .split(".")
    .forEach((part) => {
      if (part.startsWith("i")) out.id = part.slice(1);
      else if (part.startsWith("r")) out.ref = part.slice(1);
      else if (part.startsWith("c")) out.joinCode = part.slice(1);
    });
  return out;
}

function shareQuery({ token, joinCode, ref }) {
  const q = new URLSearchParams();
  const t = String(token || "").trim();
  if (t) q.set("token", t);
  const code = String(joinCode || "").trim();
  if (code) q.set("joinCode", code);
  const r = String(ref || "").trim();
  if (r) q.set("ref", r);
  return q.toString();
}

function mpSharePath({ id, ref, joinCode }) {
  let path = `/pages/schedule/schedule?id=${id}`;
  if (ref) path += `&ref=${encodeURIComponent(ref)}`;
  if (joinCode) path += `&joinCode=${encodeURIComponent(joinCode)}`;
  return path;
}

function yuan(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v) : 0;
}

function clipText(raw, max) {
  const text = String(raw || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function renderCardSvg(facts) {
  const title = escapeXml(clipText(facts.title, 18));
  const price = facts.free ? "免费" : `¥${yuan(facts.price)}`;
  const cover = facts.cover
    ? `<image href="${escapeXml(facts.cover)}" x="0" y="0" width="500" height="228" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="500" height="228" fill="#1b4332"/><text x="250" y="124" text-anchor="middle" fill="#fff" font-size="28" font-family="sans-serif">${title}</text>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="500" height="400" viewBox="0 0 500 400">
  <rect width="500" height="400" fill="#fff"/>
  ${cover}
  <rect x="0" y="228" width="500" height="172" fill="#fff"/>
  <text x="24" y="268" fill="#111" font-size="22" font-weight="700" font-family="PingFang SC, sans-serif">${title}</text>
  <text x="24" y="306" fill="#c2410c" font-size="32" font-weight="800" font-family="sans-serif">${escapeXml(price)}</text>
  <rect x="24" y="328" width="132" height="40" rx="20" fill="#e11d48"/>
  <text x="90" y="355" text-anchor="middle" fill="#fff" font-size="16" font-weight="700" font-family="PingFang SC, sans-serif">立即报名</text>
  <text x="476" y="354" text-anchor="end" fill="#888" font-size="13" font-family="PingFang SC, sans-serif">同行者众</text>
</svg>`;
}

function renderPosterSvg(facts, qrDataUrl) {
  const title = escapeXml(clipText(facts.title, 22));
  const kind = escapeXml(facts.kindLabel || "个人");
  const when = escapeXml(`${facts.startDate || ""} ${facts.meetupTime || ""}`.trim());
  const meetup = escapeXml(clipText(facts.meetupPoint || "", 16));
  const people = escapeXml(`已报名 ${facts.enrolled || 0}/${facts.maxSeats || 0}，最低成团 ${facts.minGroup || 0}`);
  const host = escapeXml(facts.organizerName || "同行者众");
  const origin = yuan(facts.originPrice);
  const member = yuan(facts.memberPrice);
  const student = yuan(facts.studentPrice);
  const cover = facts.cover
    ? `<image href="${escapeXml(facts.cover)}" x="0" y="0" width="750" height="360" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="750" height="360" fill="#1b4332"/>`;
  const prices = facts.free
    ? `<text x="28" y="548" fill="#1b4332" font-size="36" font-weight="800" font-family="sans-serif">免费</text>`
    : `<text x="28" y="508" fill="#888" font-size="13" font-family="PingFang SC, sans-serif">原价</text>
       <text x="78" y="508" fill="#888" font-size="13" font-family="PingFang SC, sans-serif">会员</text>
       <text x="128" y="508" fill="#888" font-size="13" font-family="PingFang SC, sans-serif">学生</text>
       <text x="28" y="548" fill="#c2410c" font-size="32" font-weight="800" font-family="sans-serif">¥${origin}</text>
       <text x="148" y="548" fill="#c2410c" font-size="22" font-weight="700" font-family="sans-serif">¥${member}</text>
       <text x="248" y="548" fill="#c2410c" font-size="22" font-weight="700" font-family="sans-serif">¥${student}</text>`;
  const qr = qrDataUrl
    ? `<image href="${escapeXml(qrDataUrl)}" x="528" y="430" width="190" height="190"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="750" height="980" viewBox="0 0 750 980">
  <rect width="750" height="980" fill="#f4efe6"/>
  <rect x="0" y="0" width="750" height="980" rx="0" fill="#fff"/>
  ${cover}
  <rect x="28" y="384" width="72" height="28" rx="14" fill="#1b4332"/>
  <text x="64" y="404" text-anchor="middle" fill="#fff" font-size="14" font-weight="700" font-family="PingFang SC, sans-serif">${kind}</text>
  <text x="112" y="406" fill="#111" font-size="28" font-weight="800" font-family="PingFang SC, sans-serif">${title}</text>
  ${prices}
  <text x="520" y="418" fill="#c2410c" font-size="18" font-weight="700" font-family="PingFang SC, sans-serif">扫码报名</text>
  ${qr}
  <text x="28" y="610" fill="#888" font-size="18" font-family="PingFang SC, sans-serif">时间</text>
  <text x="92" y="610" fill="#111" font-size="22" font-weight="700" font-family="sans-serif">${when}</text>
  <text x="28" y="656" fill="#888" font-size="18" font-family="PingFang SC, sans-serif">集合</text>
  <text x="92" y="656" fill="#111" font-size="22" font-weight="700" font-family="PingFang SC, sans-serif">${meetup}</text>
  <text x="28" y="702" fill="#888" font-size="18" font-family="PingFang SC, sans-serif">人数</text>
  <text x="92" y="702" fill="#111" font-size="20" font-weight="600" font-family="PingFang SC, sans-serif">${people}</text>
  <text x="28" y="748" fill="#888" font-size="18" font-family="PingFang SC, sans-serif">发起</text>
  <text x="92" y="748" fill="#1b4332" font-size="20" font-weight="700" font-family="PingFang SC, sans-serif">${host}</text>
  <rect x="28" y="790" width="694" height="150" rx="18" fill="#f4efe6"/>
  <text x="52" y="838" fill="#1b4332" font-size="22" font-weight="700" font-family="PingFang SC, sans-serif">好友报名，分享人得团费 ${Math.round(Number(facts.rate || 0.05) * 100)}%</text>
  <text x="52" y="878" fill="#555" font-size="16" font-family="PingFang SC, sans-serif">微信内可直接转发给好友或群，点卡片进小程序报名。</text>
  <text x="52" y="910" fill="#555" font-size="16" font-family="PingFang SC, sans-serif">长按或扫描右侧二维码，也能打开本团。</text>
</svg>`;
}

function shareTitleOf(facts) {
  const name = clipText(facts.title || "同行者众", 16);
  if (facts.free) return `${name} 免费报名`;
  return `${name} ¥${yuan(facts.price)} 立即报名`;
}

async function qrForShare({ h5Url, scene, joinCode }) {
  if (!joinCode && loginLive()) {
    try {
      const buf = await getWxaCode({ scene, page: "pages/schedule/schedule" });
      if (buf && buf.length > 40) return `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      /* 小程序码失败时退回 H5 二维码 */
    }
  }
  return QRCode.toDataURL(h5Url, { margin: 1, width: 360 });
}

async function buildSchedulePoster(sch, req, { userId } = {}) {
  const db = getDb();
  const routeRow = db.prepare("SELECT * FROM routes WHERE id=?").get(sch.route_id);
  const route = toRoute(routeRow);
  const live = enrolledCount(sch.id);
  const quote = quoteForSchedule(sch, Math.max(1, live), null);
  const kind = tripKindOf(sch.organizer_type, sch.channel === "activity" ? "activity" : "trip");
  const ref = userId ? ensureReferralCode(userId) : "";
  const joinCode = String(sch.join_code || "").trim();
  const qs = shareQuery({ token: sch.share_token, joinCode, ref });
  const h5Url = `${publicBase(req)}/m/schedule/${sch.id}${qs ? `?${qs}` : ""}`;
  const mpPath = mpSharePath({ id: sch.id, ref, joinCode });
  const scene = encodeShareScene({ id: sch.id, ref, joinCode });
  const qr = await qrForShare({ h5Url, scene, joinCode });
  const facts = {
    id: sch.id,
    title: route?.title || "行程",
    cover: attachAssetHost(req, route?.cover || ""),
    kind: kind.key,
    kindLabel: kind.label,
    originPrice: quote.originPrice,
    memberPrice: quote.memberPrice,
    studentPrice: quote.studentPrice,
    price: quote.price,
    free: Number(quote.price || 0) === 0 && Number(quote.originPrice || 0) === 0,
    startDate: sch.start_date,
    meetupTime: sch.meetup_time || "",
    meetupPoint: sch.meetup_point || "",
    enrolled: live,
    maxSeats: sch.max_seats,
    minGroup: sch.min_group_size,
    organizerName: sch.organizer_type === "official" ? "同行者众" : sch.organizer_name || "",
    rate: config.referral.enrollRate,
  };
  return {
    url: h5Url,
    qr,
    mpPath,
    scene,
    shareTitle: shareTitleOf(facts),
    shareImage: facts.cover || "",
    referralCode: ref,
    rate: facts.rate,
    posterSvg: renderPosterSvg(facts, qr),
    cardSvg: renderCardSvg(facts),
    facts,
  };
}

module.exports = {
  encodeShareScene,
  decodeShareScene,
  shareQuery,
  mpSharePath,
  buildSchedulePoster,
  renderPosterSvg,
  renderCardSvg,
};
