export const ROLE_OPTIONS = [
  { value: "admin", label: "超级管理员" },
  { value: "operator", label: "运营" },
  { value: "leader", label: "领队" },
  { value: "photographer", label: "摄影" },
];

export function roleLabel(role) {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label || "超级管理员";
}

export function capsOf(role) {
  if (role === "admin") return ["staff", "ops", "field", "roster", "photo"];
  if (role === "operator") return ["ops", "field", "roster", "photo"];
  if (role === "leader") return ["field", "roster", "photo"];
  if (role === "photographer") return ["roster", "photo"];
  return [];
}

export function hasCap(me, cap) {
  const caps = Array.isArray(me?.caps) && me.caps.length ? me.caps : capsOf(me?.role);
  return caps.includes(cap);
}
