export function mediaSrc(url) {
  const u = String(url || "");
  const hit = u.match(/\/static\/[^?\s#]+/);
  return hit ? hit[0] : u;
}

export function slideFallback(slide) {
  return slide?.code ? `/static/routes/${slide.code}.svg` : "";
}

export function slideBg(slide) {
  const src = mediaSrc(slide?.url) || slideFallback(slide);
  if (!src) return {};
  return { backgroundImage: `url("${src.replace(/"/g, "")}")` };
}

export function slideRouteTarget(slide) {
  const id = Number(slide?.routeId);
  if (!Number.isInteger(id) || id <= 0) return "";
  return `/m/route/${id}`;
}
