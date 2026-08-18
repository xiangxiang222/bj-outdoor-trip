function localCover(code) {
  return code ? "/images/covers/" + code + ".jpg" : "";
}

function packedThumb(item) {
  if (!item) return "";
  if (typeof item === "string") return item;
  return item.thumb || "";
}

function isPackedPhoto(item) {
  const thumb = packedThumb(item);
  return thumb.startsWith("/images/covers/") || thumb.startsWith("/pkg-detail/");
}

function withLocalMedia(row) {
  if (!row || !row.code) return row;
  const cover = localCover(row.code);
  const packed = (row.gallery || []).filter(isPackedPhoto);
  return Object.assign({}, row, {
    cover,
    gallery: packed.length ? packed : [{ thumb: cover, src: "", origin: "" }],
  });
}

function withLocalMediaList(rows) {
  return (Array.isArray(rows) ? rows : []).map(withLocalMedia);
}

function detailUrl(id) {
  return "/pkg-detail/detail/detail?id=" + id;
}

function shareCover(cover) {
  const c = cover ? String(cover) : "";
  if (/^https?:\/\//.test(c)) return c;
  if (c.startsWith("/images/") || c.startsWith("/pkg-detail/")) return c;
  return "";
}

module.exports = { localCover, withLocalMedia, withLocalMediaList, detailUrl, packedThumb, shareCover };
