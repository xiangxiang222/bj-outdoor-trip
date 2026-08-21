export const OFFER_TYPES = [
  { key: "early", label: "早鸟团", color: "#2d6a4f" },
  { key: "deal", label: "特惠团", color: "#bc4749" },
  { key: "free", label: "免费团", color: "#40916c" },
  { key: "full", label: "全价团", color: "#1b4332" },
];

export function offerOf(key) {
  return OFFER_TYPES.find((o) => o.key === key) || OFFER_TYPES[3];
}
