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

export function matchesRoutePreference(row, preference) {
  if (!row || !preference) return false;
  const categories = Array.isArray(preference.categories) ? preference.categories : [];
  const tags = Array.isArray(preference.tags) ? preference.tags : [];
  return categories.includes(row.category) || (Array.isArray(row.tags) && row.tags.some((tag) => tags.includes(tag)));
}

export function matchingRoutePreferences(row, preferences) {
  return (Array.isArray(preferences) ? preferences : [])
    .filter((preference) => preference.status === "on" && matchesRoutePreference(row, preference))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.key).localeCompare(String(b.key)));
}

export function filterRoutes(rows, query = {}, preferences = []) {
  const list = Array.isArray(rows) ? rows : [];
  const q = text(query.q).toLowerCase();
  const review = text(query.review);
  const status = text(query.status);
  const category = text(query.category);
  const difficulty = text(query.difficulty);
  const season = text(query.season);
  const region = text(query.region);
  const tag = text(query.tag);
  const source = text(query.source);
  const preferenceKey = text(query.preference);
  const preference = (Array.isArray(preferences) ? preferences : []).find((item) => item.key === preferenceKey && item.status === "on");
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
    if (preferenceKey && (!preference || !matchesRoutePreference(row, preference))) return false;
    if (source === "bot" && row.source !== "bot") return false;
    if (source === "user" && !row.submittedBy) return false;
    if (source === "official" && (row.source === "bot" || row.submittedBy)) return false;
    if (q && !haystack(row).includes(q)) return false;
    return true;
  });
}
