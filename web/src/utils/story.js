export function composeStory(description, gallery) {
  const paras = String(description || "")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  const photos = (Array.isArray(gallery) ? gallery : [])
    .map((item) => (typeof item === "string" ? item : item?.url || item?.src || item?.thumb || ""))
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  if (!paras.length) {
    return photos.slice(0, 1).map((url) => ({ type: "image", url, caption: "" }));
  }
  const blocks = [];
  paras.forEach((body, i) => {
    blocks.push({ type: "text", body });
    if (photos[i]) blocks.push({ type: "image", url: photos[i], caption: "" });
  });
  return blocks;
}

export function storyAlbum(gallery, story) {
  const used = new Set(
    (story || []).filter((b) => b.type === "image").map((b) => b.url).filter(Boolean)
  );
  return (gallery || []).filter((url) => url && !used.has(url));
}
