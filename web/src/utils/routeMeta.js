export const ROUTE_CATEGORIES = ["长城", "登山", "山水", "玩水", "文化", "草原", "海滨"];

export const ROUTE_DIFFICULTIES = ["休闲", "进阶"];

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
