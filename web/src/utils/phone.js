export function telHref(phone) {
  const n = String(phone || "").replace(/[\s-]+/g, "");
  if (!/^1\d{10}$/.test(n) && !/^\+?\d{7,15}$/.test(n)) return "";
  return `tel:${n}`;
}
