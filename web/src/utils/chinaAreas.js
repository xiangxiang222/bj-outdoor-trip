import rawAreas from "../data/china-areas.json";

const MUNICIPALITIES = new Set(["北京市", "天津市", "上海市", "重庆市"]);
const FLATTEN_CITY = new Set(["市辖区", "县", "省直辖县级行政区划", "自治区直辖县级行政区划"]);

const SUFFIXES = [
  "满族蒙古族自治县",
  "土家族苗族自治县",
  "苗族土家族自治县",
  "侗族自治县",
  "瑶族自治县",
  "各族自治县",
  "维吾尔自治区",
  "壮族自治区",
  "回族自治区",
  "特别行政区",
  "自治州",
  "自治县",
  "自治旗",
  "联合旗",
  "自治区",
  "地区",
  "盟",
  "省",
  "市",
  "区",
  "县",
  "旗",
];

export function shortAreaName(name) {
  let text = String(name || "").trim();
  for (const suffix of SUFFIXES) {
    if (text.length > suffix.length && text.endsWith(suffix)) {
      text = text.slice(0, -suffix.length);
      break;
    }
  }
  return text;
}

export function buildChinaAreaTree(raw) {
  return Object.entries(raw || {}).map(([province, cities]) => {
    const entries = Object.entries(cities || {});
    if (MUNICIPALITIES.has(province)) {
      const districts = entries.flatMap(([, list]) => list || []);
      return {
        value: province,
        label: province,
        children: districts.map((d) => ({ value: d, label: d })),
      };
    }
    const children = [];
    for (const [city, districts] of entries) {
      if (FLATTEN_CITY.has(city)) {
        for (const d of districts || []) children.push({ value: d, label: d });
        continue;
      }
      children.push({
        value: city,
        label: city,
        children: (districts || []).map((d) => ({ value: d, label: d })),
      });
    }
    return { value: province, label: province, children };
  });
}

export const chinaAreaOptions = buildChinaAreaTree(rawAreas);

export function formatRegion(path) {
  return (Array.isArray(path) ? path : []).map((p) => String(p || "").trim()).filter(Boolean).join(" / ");
}

function namesOf(node) {
  const value = String(node?.value || "");
  const short = shortAreaName(value);
  return [...new Set([value, short].filter(Boolean))];
}

function matchChild(text, children) {
  let best = null;
  let used = "";
  for (const child of children || []) {
    for (const name of namesOf(child)) {
      if (text.startsWith(name) && name.length > used.length) {
        best = child;
        used = name;
      }
    }
  }
  return best ? { node: best, rest: text.slice(used.length) } : null;
}

function matchExactPath(parts, tree) {
  let nodes = tree;
  const path = [];
  for (const part of parts) {
    const hit = matchChild(part, nodes);
    if (!hit || hit.rest) return null;
    path.push(hit.node.value);
    nodes = hit.node.children || [];
  }
  return path;
}

export function findRegionPath(text, tree = chinaAreaOptions) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const slashParts = raw.split(/\s*\/\s*/).filter(Boolean);
  if (slashParts.length >= 2) {
    const exact = matchExactPath(slashParts, tree);
    if (exact) return exact;
    return [];
  }
  const compact = raw.replace(/\s+/g, "");
  const province = matchChild(compact, tree);
  if (!province) return [];
  const path = [province.node.value];
  let rest = province.rest;
  if (!rest) return path;
  const city = matchChild(rest, province.node.children || []);
  if (!city) return [];
  path.push(city.node.value);
  rest = city.rest;
  if (!rest) return path;
  const district = matchChild(rest, city.node.children || []);
  if (!district || district.rest) return [];
  path.push(district.node.value);
  return path;
}
