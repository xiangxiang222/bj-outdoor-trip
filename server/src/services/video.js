const MAX_VIDEOS = 6;
const MAX_LEN = 400;

function parseVideoInput(input) {
  let list = [];
  if (Array.isArray(input)) list = input;
  else if (typeof input === "string") list = input.split(/[\n,，;；]+/);
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const url = normalizeHref(raw && typeof raw === "object" ? raw.url || raw.href : raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_VIDEOS) break;
  }
  return out;
}

function normalizeHref(value) {
  let href = String(value || "").trim();
  if (!href || href.length > MAX_LEN) return "";
  if (href.startsWith("//")) href = "https:" + href;
  if (!/^https?:\/\//i.test(href)) return "";
  if (/^(javascript|data|file|ftp):/i.test(href)) return "";
  return href;
}

function queryParam(href, name) {
  try {
    return new URL(href).searchParams.get(name) || "";
  } catch {
    return "";
  }
}

function parsePage(href) {
  const n = Number(queryParam(href, "p") || queryParam(href, "page") || 1);
  return n >= 1 && n <= 99 ? n : 1;
}

function parseBvid(href) {
  const hit = String(href || "").match(/BV[0-9A-Za-z]{10,12}/);
  return hit ? hit[0] : "";
}

function parseAid(href) {
  const fromQuery = queryParam(href, "aid");
  if (/^\d+$/.test(fromQuery)) return fromQuery;
  const hit = String(href || "").match(/\/video\/av(\d+)/i);
  return hit ? hit[1] : "";
}

function youtubeId(href) {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.replace(/^\//, "").split("/")[0] || "";
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/);
      return m ? m[1] : "";
    }
  } catch {
    /* ignore */
  }
  return "";
}

function isDirectFile(href) {
  return /\.(mp4|webm|m4v|ogg)(\?|#|$)/i.test(href);
}

function videoPlayerOf(url) {
  const href = normalizeHref(url);
  if (!href) return null;
  const bvid = parseBvid(href);
  const aid = parseAid(href);
  if (bvid || aid) {
    const qs = new URLSearchParams({
      isOutside: "true",
      high_quality: "1",
      danmaku: "0",
      autoplay: "0",
      page: String(parsePage(href)),
    });
    if (bvid) qs.set("bvid", bvid);
    else qs.set("aid", aid);
    return {
      url: href,
      provider: "bilibili",
      kind: "iframe",
      embedUrl: `https://player.bilibili.com/player.html?${qs.toString()}`,
      label: "B站",
    };
  }
  if (/b23\.tv|bilibili\.com/i.test(href)) {
    return { url: href, provider: "bilibili", kind: "link", embedUrl: "", label: "B站" };
  }
  const yt = youtubeId(href);
  if (yt) {
    return {
      url: href,
      provider: "youtube",
      kind: "iframe",
      embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}`,
      label: "YouTube",
    };
  }
  if (isDirectFile(href)) {
    return { url: href, provider: "file", kind: "video", embedUrl: href, label: "视频" };
  }
  return { url: href, provider: "link", kind: "link", embedUrl: "", label: "视频" };
}

function videoViews(input) {
  return parseVideoInput(input).map(videoPlayerOf).filter(Boolean);
}

module.exports = { parseVideoInput, videoPlayerOf, videoViews };
