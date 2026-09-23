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

function hostnameOf(href) {
  try {
    return new URL(href).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isDouyinHost(host) {
  return (
    host === "douyin.com" ||
    host === "iesdouyin.com" ||
    host === "v.douyin.com" ||
    host === "m.douyin.com" ||
    host.endsWith(".douyin.com") ||
    host.endsWith(".iesdouyin.com")
  );
}

function isTikTokHost(host) {
  return (
    host === "tiktok.com" ||
    host === "m.tiktok.com" ||
    host === "vm.tiktok.com" ||
    host === "vt.tiktok.com" ||
    host.endsWith(".tiktok.com")
  );
}

function shortVideoId(href) {
  try {
    const u = new URL(href);
    for (const key of ["modal_id", "aweme_id", "vid", "video_id", "item_ids"]) {
      const value = u.searchParams.get(key) || "";
      if (/^\d{10,25}$/.test(value)) return value;
    }
    const path = u.pathname || "";
    const dy = path.match(/\/(?:share\/)?(?:video|note|aweme)\/(\d{10,25})/i);
    if (dy) return dy[1];
    const tk = path.match(/\/(?:@[^/]+\/)?(?:video|photo)\/(\d{10,25})/i);
    if (tk) return tk[1];
  } catch {
    /* ignore */
  }
  return "";
}

function douyinPlayer(href) {
  const id = shortVideoId(href);
  const watchUrl = id ? `https://www.douyin.com/video/${id}` : href;
  return {
    url: href,
    provider: "douyin",
    kind: "link",
    embedUrl: "",
    label: "抖音",
    videoId: id,
    watchUrl,
    appUrl: id ? `snssdk1128://aweme/detail/${id}` : "snssdk1128://",
  };
}

function tiktokPlayer(href) {
  const id = shortVideoId(href);
  if (id) {
    return {
      url: href,
      provider: "tiktok",
      kind: "iframe",
      embedUrl: `https://www.tiktok.com/embed/v2/${encodeURIComponent(id)}`,
      label: "TikTok",
      videoId: id,
      watchUrl: href,
      layout: "portrait",
    };
  }
  return {
    url: href,
    provider: "tiktok",
    kind: "link",
    embedUrl: "",
    label: "TikTok",
    videoId: "",
    watchUrl: href,
  };
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
  const host = hostnameOf(href);
  if (isDouyinHost(host)) return douyinPlayer(href);
  if (isTikTokHost(host)) return tiktokPlayer(href);
  if (isDirectFile(href)) {
    return { url: href, provider: "file", kind: "video", embedUrl: href, label: "视频" };
  }
  return { url: href, provider: "link", kind: "link", embedUrl: "", label: "视频" };
}

function videoViews(input) {
  return parseVideoInput(input).map(videoPlayerOf).filter(Boolean);
}

module.exports = { parseVideoInput, videoPlayerOf, videoViews };
