const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function feedWhen(iso, time) {
  const raw = String(iso || "").slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let md = raw.slice(5);
  let weekday = "";
  if (m) {
    md = String(Number(m[2])) + "/" + String(Number(m[3]));
    weekday = "周" + WEEKDAY[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()];
  }
  const t = String(time || "").trim();
  return [md, weekday, t].filter(Boolean).join(" ");
}

function boardedLine(row, channel) {
  const activity = channel === "activity" || (row && row.channel === "activity");
  const remain = Number(row && row.remain);
  if (Number.isFinite(remain) && remain <= 0) return "已满·可候补";
  const n = Number(row && row.enrolled) || 0;
  if (n > 0) return activity ? n + "人已报名" : n + "人已上车";
  if (Number.isFinite(remain)) return activity ? "余 " + remain + " 人" : "余 " + remain + " 座";
  return "";
}

function hostName(row) {
  if (!row) return "";
  if (row.organizerType === "company") return row.companyName || row.organizerName || "";
  return row.organizerName || row.companyName || "";
}

function coverOf(row) {
  if (!row) return "";
  const route = row.route || {};
  const g = row.gallery || route.gallery || [];
  const first = g[0];
  if (typeof first === "string" && first) return first;
  if (first && typeof first === "object") return first.thumb || first.src || first.url || "";
  return route.cover || row.cover || "";
}

function taglineOf(row) {
  const tags = ((row && row.playTags) || []).map((t) => t.name || t).filter(Boolean);
  if (tags.length) return tags.slice(0, 3).join(" · ");
  return (row && row.route && row.route.subtitle) || (row && row.eligibility && row.eligibility.label) || "";
}

function coverMark(row) {
  const t = String((row && row.route && row.route.title) || (row && row.title) || "").trim();
  return t.slice(0, 1) || "局";
}

function decorateFeed(row, channel) {
  const quote = (row && row.quote) || {};
  const price = Number(quote.tripPrice != null ? quote.tripPrice : quote.originPrice || 0);
  return Object.assign({}, row, {
    feedWhen: feedWhen(row.startDate, row.meetupTime),
    boarded: boardedLine(row, channel || row.channel),
    host: hostName(row),
    cover: coverOf(row),
    coverMark: coverMark(row),
    tagline: taglineOf(row),
    free: price === 0 || row.offerType === "free",
    price,
  });
}

module.exports = { feedWhen, boardedLine, hostName, coverOf, coverMark, taglineOf, decorateFeed };
