function text(value) {
  if (value == null) return "";
  return String(value).trim();
}

function haystack(row) {
  return [row.title, row.subtitle, row.code, row.region, row.category, ...(row.tags || [])]
    .map((part) => text(part))
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function filterRoutes(rows, query = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const q = text(query.q).toLowerCase();
  const review = text(query.review);
  const status = text(query.status);
  const category = text(query.category);
  const difficulty = text(query.difficulty);
  const season = text(query.season);
  const region = text(query.region);
  const tag = text(query.tag);
  const days = query.days === "" || query.days == null ? null : Number(query.days);

  return list.filter((row) => {
    if (review && row.reviewStatus !== review) return false;
    if (status && row.status !== status) return false;
    if (days != null && !Number.isNaN(days) && Number(row.days) !== days) return false;
    if (category && row.category !== category) return false;
    if (difficulty && row.difficulty !== difficulty) return false;
    if (season && row.season !== season) return false;
    if (region && !text(row.region).includes(region)) return false;
    if (tag && !(row.tags || []).includes(tag)) return false;
    if (q && !haystack(row).includes(q)) return false;
    return true;
  });
}
