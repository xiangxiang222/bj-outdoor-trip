function photoOf(item) {
  if (!item) return "";
  if (typeof item === "string") return item.trim();
  return String(item.src || item.origin || item.url || item.thumb || "").trim();
}

function paragraphsOf(description) {
  return String(description || "")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeStory(blocks) {
  const out = [];
  for (const raw of Array.isArray(blocks) ? blocks : []) {
    if (!raw || typeof raw !== "object") continue;
    if (raw.type === "image") {
      const url = photoOf(raw);
      if (!url) continue;
      out.push({ type: "image", url, caption: String(raw.caption || "").trim() });
      continue;
    }
    const body = String(raw.body || raw.text || "").trim();
    if (body) out.push({ type: "text", body });
  }
  return out;
}

function composeStory(description, gallery) {
  const paras = paragraphsOf(description);
  const photos = (Array.isArray(gallery) ? gallery : []).map(photoOf).filter(Boolean).slice(0, 3);
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

function storyOf(route) {
  const saved = normalizeStory(route?.story);
  if (saved.length) return saved;
  return composeStory(route?.description, route?.gallery);
}

function normalizeItinerary(items) {
  return (Array.isArray(items) ? items : [])
    .map((it) => ({
      time: String(it?.time || "").trim(),
      title: String(it?.title || "").trim(),
      detail: String(it?.detail || "").trim(),
      photo: photoOf(it?.photo),
    }))
    .filter((it) => it.time || it.title || it.detail);
}

module.exports = { photoOf, paragraphsOf, normalizeStory, composeStory, storyOf, normalizeItinerary };
