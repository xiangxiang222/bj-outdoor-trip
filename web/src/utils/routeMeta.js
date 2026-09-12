export const ROUTE_CATEGORIES = ["长城", "登山", "山水", "玩水", "文化", "草原", "海滨"];

export const ROUTE_DIFFICULTIES = ["休闲", "进阶"];

export const ROUTE_SEASONS = ["四季", "3-11月", "4-10月", "4-11月", "5-10月", "6-9月", "6-10月"];

export const COMMON_ROUTE_TAGS = [
  "长城",
  "亲子",
  "摄影",
  "纯玩",
  "徒步",
  "登山",
  "玩水",
  "漂流",
  "露营",
  "星空",
  "文化",
  "草原",
  "海滨",
  "团建",
  "情侣",
  "避暑",
];

export const COMMON_MEETUPS = [
  { id: "dzm", name: "东直门东方银座C口", timeHint: "07:30", geo: "地铁2号线东直门站C口" },
  { id: "xzm", name: "西直门凯德mall北门外", timeHint: "07:20", geo: "地铁4号线西直门站" },
  { id: "gm", name: "国贸桥下大巴停靠点", timeHint: "07:10", geo: "地铁1号线国贸站" },
  { id: "lsh", name: "丽泽桥西南角", timeHint: "07:00", geo: "地铁14号线丽泽商务区" },
];

export const MEMBER_DISCOUNT = 0.95;

export function memberPriceOf(price) {
  return Math.round(Number(price || 0) * MEMBER_DISCOUNT);
}

export function defaultPriceTiers() {
  return [10, 20, 30, 50].map((minPeople, i) => {
    const price = [199, 179, 159, 139][i];
    return {
      minPeople,
      maxPeople: minPeople === 50 ? 55 : null,
      price,
      memberPrice: memberPriceOf(price),
    };
  });
}

export function normalizePriceTiers(list) {
  return (Array.isArray(list) ? list : []).map((t) => {
    const price = Number(t.price) || 0;
    const stored = t.memberPrice ?? t.member_price;
    return {
      minPeople: Number(t.minPeople ?? t.min_people) || 0,
      maxPeople: t.maxPeople ?? t.max_people ?? null,
      price,
      memberPrice: stored == null || stored === "" ? memberPriceOf(price) : Number(stored),
    };
  });
}

export function serializePriceTiers(list) {
  return normalizePriceTiers(list)
    .filter((t) => t.minPeople > 0)
    .map((t) => ({
      minPeople: t.minPeople,
      maxPeople: t.maxPeople || null,
      price: t.price,
      memberPrice: Number.isFinite(t.memberPrice) ? t.memberPrice : memberPriceOf(t.price),
    }));
}

export function serializeMeetupPoints(list) {
  return (Array.isArray(list) ? list : [])
    .map((p) => ({
      id: String(p.id || "").trim() || String(p.name || "").trim(),
      name: String(p.name || "").trim(),
      timeHint: String(p.timeHint || "").trim(),
      geo: String(p.geo || "").trim(),
    }))
    .filter((p) => p.name);
}

export const ROUTE_REGIONS = [
  "北京怀柔",
  "北京延庆",
  "北京昌平",
  "北京密云",
  "北京房山",
  "北京门头沟",
  "北京海淀",
  "北京平谷",
  "北京延庆 / 昌平",
  "北京怀柔 / 密云",
  "北京房山 / 河北涞水",
  "北京密云 / 河北兴隆",
  "河北滦平 / 北京密云",
  "河北涞水 / 北京房山",
  "河北保定涞源",
  "河北承德",
  "河北承德围场",
  "河北张家口",
  "河北秦皇岛",
  "天津蓟州",
  "内蒙古赤峰 / 河北围场",
  "内蒙古 / 河北承德",
  "山西忻州 / 大同",
  "北京周边",
];

export function mergeOptions(preset, ...extras) {
  const seen = new Set();
  const out = [];
  for (const value of [...preset, ...extras.flat()]) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}
