export function splitCampusNames(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || "").split(/[,，;；\n]+/);
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const name = String(item || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function joinCampusNames(list) {
  return splitCampusNames(list).join("，");
}

export function campusPickLabel(value, emptyText) {
  const names = splitCampusNames(value);
  if (!names.length) return emptyText || "";
  return names.join("、");
}
