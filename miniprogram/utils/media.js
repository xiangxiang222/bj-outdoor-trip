const { baseUrl: defaultBaseUrl, mediaBaseUrl } = require("../config");

// Old cached responses may still point at files previously bundled in the app.
function remotePath(url) {
  return String(url || "")
    .replace(/^\/images\/covers\//, "/static/miniprogram/covers/")
    .replace(/^\/pkg-detail\/gallery\//, "/static/miniprogram/gallery/")
    .replace(/^\/images\/mine-icons\//, "/static/miniprogram/account-v2/")
    .replace(/^\/images\/logo\.jpg$/, "/static/miniprogram/logo.jpg");
}

function localCover(code) {
  return code ? mediaBaseUrl + "/covers/" + encodeURIComponent(code) + ".jpg" : "";
}

function absMedia(url, baseUrl) {
  const u = remotePath(url);
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  // Navigation icons must remain packaged and work before the network loads.
  if (u.startsWith("/images/")) return u;
  if (u.startsWith("/")) return String(baseUrl || defaultBaseUrl).replace(/\/$/, "") + u;
  return u;
}

function packedThumb(item) {
  if (!item) return "";
  return absMedia(typeof item === "string" ? item : item.thumb || item.src || item.url || "");
}

function withLocalMedia(row) {
  if (!row) return row;
  const cover = absMedia(row.cover) || localCover(row.code);
  const gallery = (row.gallery || []).map((item) => {
    if (typeof item === "string") return absMedia(item);
    if (!item) return item;
    const next = Object.assign({}, item);
    ["thumb", "src", "origin", "url"].forEach((key) => {
      if (next[key]) next[key] = absMedia(next[key]);
    });
    return next;
  });
  return Object.assign({}, row, {
    cover,
    gallery: gallery.length ? gallery : cover ? [{ thumb: cover, src: cover, origin: "" }] : [],
  });
}

function withLocalMediaList(rows) {
  return (Array.isArray(rows) ? rows : []).map(withLocalMedia);
}

function detailUrl(id) {
  return "/pkg-detail/detail/detail?id=" + id;
}

function withAbsSlides(slides, baseUrl) {
  return (Array.isArray(slides) ? slides : []).map((s) => Object.assign({}, s, { url: absMedia(s && s.url, baseUrl) }));
}

function shareCover(cover) {
  const c = absMedia(cover);
  return /^https?:\/\//i.test(c) || c.startsWith("/images/") ? c : "";
}

// Normalize legacy media in cached objects without changing ordinary strings/links.
function normalizeLegacyMedia(value) {
  if (Array.isArray(value)) return value.map(normalizeLegacyMedia);
  if (value && typeof value === "object") {
    const next = {};
    Object.keys(value).forEach((key) => { next[key] = normalizeLegacyMedia(value[key]); });
    return next;
  }
  if (typeof value === "string" && remotePath(value) !== value) return absMedia(value);
  return value;
}

module.exports = { localCover, withLocalMedia, withLocalMediaList, detailUrl, packedThumb, shareCover, absMedia, withAbsSlides, normalizeLegacyMedia };
