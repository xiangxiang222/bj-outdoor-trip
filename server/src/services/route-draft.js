const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");
const config = require("../config");
const { PLACE_ALBUMS } = require("../seed/place-albums-config");

const CATEGORIES = ["长城", "登山", "山水", "玩水", "文化", "草原", "海滨"];
const UA = "bj-outdoor-trip/1.0 (route draft; https://github.com/xiangxiang222/bj-outdoor-trip)";
const MIN_PHOTO_BYTES = 8000;
const SEARCH_TIMEOUT_MS = 5000;
const DOWNLOAD_TIMEOUT_MS = 10000;
const GENERIC_PLACE_WORDS = new Set([
  "北京",
  "北京市",
  "河北",
  "河北省",
  "山西",
  "山西省",
  "天津",
  "天津市",
  "内蒙古",
  "门头沟",
  "怀柔",
  "平谷",
  "密云",
  "延庆",
  "房山",
  "昌平",
  "海淀",
  "朝阳",
  "丰台",
  "石景山",
  "通州",
  "顺义",
  "大兴",
  "蓟州",
]);

function inUnitTest() {
  return String(process.env.MMC_DATA_DIR || "").includes("bj-ut-");
}

function inferCategory(title, category) {
  const hinted = String(category || "").trim();
  if (CATEGORIES.includes(hinted)) return hinted;
  const text = String(title || "");
  if (/长城|慕田峪|八达岭|金山岭|司马台|黄花|居庸/.test(text)) return "长城";
  if (/草原|坝上|乌兰|围场|赛罕|木兰/.test(text)) return "草原";
  if (/海|北戴河|山海关|老龙头/.test(text)) return "海滨";
  if (/漂流|玩水|湖|峡|玻璃栈/.test(text)) return "玩水";
  if (/寺|庙|故宫|古镇|村|石窟/.test(text)) return "文化";
  if (/徒步|登山|峰|岭/.test(text)) return "登山";
  if (/山/.test(text) && !/山水/.test(text)) return "登山";
  return "山水";
}

function inferSeason(category) {
  if (category === "玩水") return "6-9月";
  if (category === "草原") return "6-10月";
  if (category === "海滨") return "6-9月";
  return "4-10月";
}

function inferDifficulty(title, notes) {
  return /徒步|登山|进阶|夜路|高强度/.test(`${title} ${notes}`) ? "进阶" : "休闲";
}

function placeNameOf(title) {
  const cleaned = String(title || "")
    .replace(/一日游|两日游|二日游|三日游|多日游|跟团游|纯玩|缆车/g, "")
    .trim();
  return cleaned || String(title || "").trim();
}

function templateDraft(input) {
  const title = String(input.title || "").trim();
  const region = String(input.region || "").trim() || "北京周边";
  const days = Number(input.days) || 1;
  const notes = String(input.notes || "").trim();
  const category = inferCategory(title, input.category);
  const place = placeNameOf(title);
  const dayWord = days >= 5 ? "多日" : `${days}日`;
  const tags = [category, days <= 1 ? "一日" : "过夜", "纯玩"];
  if (/亲子/.test(notes)) tags.push("亲子");
  if (/摄影/.test(notes)) tags.push("摄影");
  const itinerary =
    days <= 1
      ? [
          { time: "07:30", title: "市区集合发车", detail: "核名单后出发，车上休息" },
          { time: "10:00", title: place, detail: "下车活动，自由拍照，领队带节奏" },
          { time: "15:30", title: "返程", detail: "原路回城，预计傍晚到集合点" },
        ]
      : [
          { time: "07:30", title: "市区集合发车", detail: "核名单后出发" },
          { time: "11:00", title: place, detail: "抵达后按节奏活动" },
          { time: "18:00", title: "入住", detail: "晚饭后自由活动" },
          { time: "次日 08:00", title: "继续行程", detail: "上午活动，下午返程" },
        ];
  return {
    subtitle: `${dayWord}${category}，${region}集合出发`,
    category,
    season: inferSeason(category),
    difficulty: inferDifficulty(title, notes),
    distanceKm: days <= 1 ? 80 : days === 2 ? 220 : 350,
    tags,
    description: [`这条线去${place}，在${region}一带。${dayWord}行程，车接车送，适合周末出门。`, notes].filter(Boolean).join("\n\n"),
    highlights: [`${place}核心路段走一圈`, "大巴往返，不用自己开车", days > 1 ? "住一晚，不赶路" : "当天去当天回"],
    itinerary,
    feeInclude: "往返大巴、司机、随车领队、座位险",
    feeExclude: "门票、餐食、个人消费",
    equipment: "运动鞋、防晒帽、外套、身份证、水杯",
    notices: "台阶多的路段量力而行；集合迟到可能无法等候。",
  };
}

function parseJsonObject(text) {
  const raw = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeLlmDraft(raw, input) {
  const parsed = raw && typeof raw === "object" ? raw : parseJsonObject(raw);
  if (!parsed) return null;
  const fallback = templateDraft(input);
  const category = inferCategory(input.title, parsed.category || input.category);
  const itinerary = Array.isArray(parsed.itinerary)
    ? parsed.itinerary
        .map((it) => ({
          time: String(it?.time || "").trim(),
          title: String(it?.title || "").trim(),
          detail: String(it?.detail || it?.body || "").trim(),
        }))
        .filter((it) => it.time || it.title || it.detail)
    : [];
  return {
    subtitle: String(parsed.subtitle || fallback.subtitle).trim(),
    category,
    season: String(parsed.season || fallback.season).trim(),
    difficulty: /进阶/.test(String(parsed.difficulty || "")) ? "进阶" : "休闲",
    distanceKm: Number(parsed.distanceKm || parsed.distance_km) || fallback.distanceKm,
    tags: asStringList(parsed.tags).length ? asStringList(parsed.tags) : fallback.tags,
    description: String(parsed.description || fallback.description).trim(),
    highlights: asStringList(parsed.highlights).length ? asStringList(parsed.highlights) : fallback.highlights,
    itinerary: itinerary.length ? itinerary : fallback.itinerary,
    feeInclude: String(parsed.feeInclude || parsed.fee_include || fallback.feeInclude).trim(),
    feeExclude: String(parsed.feeExclude || parsed.fee_exclude || fallback.feeExclude).trim(),
    equipment: String(parsed.equipment || fallback.equipment).trim(),
    notices: String(parsed.notices || fallback.notices).trim(),
  };
}

async function llmDraft(input, deps = {}) {
  const apiKey = deps.apiKey != null ? deps.apiKey : config.ai.apiKey;
  if (!apiKey) return null;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const baseUrl = String(deps.baseUrl || config.ai.baseUrl || "").replace(/\/$/, "");
  const model = deps.model || config.ai.model;
  const prompt = [
    "你是户外拼团文案编辑。根据线路写一份可直接上架的中文草稿，只输出 JSON。",
    "字段：subtitle, category(长城|登山|山水|玩水|文化|草原|海滨 之一), season, difficulty(休闲|进阶), distanceKm, tags, description, highlights, itinerary([{time,title,detail}]), feeInclude, feeExclude, equipment, notices",
    `标题：${input.title}`,
    `地区：${input.region || "未填"}`,
    `天数：${input.days || 1}`,
    `类型提示：${input.category || "未填"}`,
    `补充：${input.notes || "无"}`,
  ].join("\n");
  try {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "只输出合法 JSON。" },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeLlmDraft(data.choices?.[0]?.message?.content, input);
  } catch {
    return null;
  }
}

function isUsablePhotoTitle(title) {
  const t = String(title || "")
    .replace(/^File:/i, "")
    .trim();
  if (!t) return false;
  if (/\.(svg|pdf|djvu|webm|ogv|stl|wav|ogg|mid|opus)$/i.test(t)) return false;
  if (!/\.(jpe?g|tiff?|gif|webp|png)$/i.test(t)) return false;
  if (/location map|coat of arms|logo|icon|flag of|banner|qr code|diagram|wikidata|svg map|route map/i.test(t)) {
    return false;
  }
  return true;
}

function extOf(title) {
  const m = String(title || "")
    .toLowerCase()
    .match(/\.(jpe?g|png|gif|webp|tiff?)$/);
  if (!m) return ".jpg";
  if (m[1] === "jpeg" || m[1] === "jpg" || m[1] === "tif" || m[1] === "tiff") return ".jpg";
  return `.${m[1]}`;
}

function placeKeywords(cfg) {
  const keys = [];
  for (const query of cfg?.queries || []) {
    for (const word of String(query).match(/[\u4e00-\u9fff]{2,}/g) || []) {
      if (!GENERIC_PLACE_WORDS.has(word)) keys.push(word);
    }
  }
  return [...new Set(keys)];
}

function matchPlaces(input) {
  const title = String(input?.title || "");
  const place = placeNameOf(title);
  const hay = `${place} ${title}`;
  return Object.entries(PLACE_ALBUMS)
    .filter(([, cfg]) =>
      placeKeywords(cfg).some((word) => {
        if (hay.includes(word)) return true;
        return place.length >= 3 && word.includes(place);
      })
    )
    .map(([id, cfg]) => ({ id, cfg }));
}

function searchQueries(input) {
  const place = placeNameOf(input.title);
  const extras = [];
  for (const { cfg } of matchPlaces(input)) {
    for (const query of cfg.queries || []) {
      if (/[A-Za-z]{4,}/.test(query)) extras.push(query);
    }
  }
  return [...new Set([place, ...extras].filter((q) => q && String(q).length >= 2))].slice(0, 4);
}

function localLibraryPhotos(input, deps = {}) {
  const publicDir = deps.publicDir || config.publicDir;
  const limit = deps.limit || 4;
  const urls = [];
  for (const { cfg } of matchPlaces(input)) {
    for (const key of cfg.existing || []) {
      const rel = path.join("static", "photos", `${key}.jpg`);
      const full = path.join(publicDir, rel);
      try {
        if (fs.existsSync(full) && fs.statSync(full).size > MIN_PHOTO_BYTES) {
          urls.push(`/${rel.split(path.sep).join("/")}`);
        }
      } catch {
        /* missing file */
      }
      if (urls.length >= limit) return urls;
    }
  }
  return urls;
}

function photoSourceOf(photos) {
  if (!photos.length) return "";
  if (photos.some((url) => String(url).includes("/static/photos/"))) return "library";
  return "search";
}

async function commonsSearch(query, fetchImpl) {
  const url =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: `${query} filetype:bitmap`,
      srnamespace: "6",
      srlimit: "10",
      format: "json",
    });
  const res = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.query?.search || [])
    .map((row) =>
      String(row.title || "")
        .replace(/^File:/i, "")
        .trim()
    )
    .filter(isUsablePhotoTitle);
}

async function wikimediaRestSearch(query, fetchImpl) {
  const url =
    "https://api.wikimedia.org/core/v1/commons/search/page?" +
    new URLSearchParams({
      q: String(query || ""),
      limit: "10",
    });
  const res = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.pages || [])
    .map((row) =>
      String(row.title || row.key || "")
        .replace(/^File:/i, "")
        .replace(/_/g, " ")
        .trim()
    )
    .filter(isUsablePhotoTitle);
}

async function openverseSearch(query, fetchImpl) {
  const url =
    "https://api.openverse.org/v1/images/?" +
    new URLSearchParams({
      q: String(query || ""),
      page_size: "8",
      mature: "false",
    });
  const res = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || [])
    .map((row) => ({
      title: String(row.title || "photo.jpg"),
      url: String(row.url || "").trim(),
    }))
    .filter((row) => row.url.startsWith("http") && !/\.svg(\?|$)/i.test(row.url));
}

async function downloadBuffer(url, destPath, fetchImpl) {
  const imgRes = await fetchImpl(url, {
    headers: { "User-Agent": UA },
    redirect: "follow",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!imgRes.ok) return null;
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (buf.length < MIN_PHOTO_BYTES) return null;
  fs.writeFileSync(destPath, buf);
  return destPath;
}

async function wikimediaFileUrl(fileTitle, fetchImpl) {
  const key = String(fileTitle || "")
    .replace(/^File:/i, "")
    .trim()
    .replace(/ /g, "_");
  const url = `https://api.wikimedia.org/core/v1/commons/file/${encodeURIComponent(key)}`;
  const res = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
  if (!res.ok) return "";
  const data = await res.json();
  return data.preferred?.url || data.original?.url || data.thumbnail?.url || "";
}

async function downloadCommonsFile(fileTitle, destPath, fetchImpl) {
  const api =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      titles: `File:${fileTitle}`,
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: "1280",
      format: "json",
    });
  try {
    const infoRes = await fetchImpl(api, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
    if (infoRes.ok) {
      const data = await infoRes.json();
      const page = Object.values(data.query?.pages || {})[0];
      const url = page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url;
      if (url) {
        const saved = await downloadBuffer(url, destPath, fetchImpl);
        if (saved) return saved;
      }
    }
  } catch {
    /* try the REST file endpoint */
  }
  try {
    const url = await wikimediaFileUrl(fileTitle, fetchImpl);
    if (url) return downloadBuffer(url, destPath, fetchImpl);
  } catch {
    /* skip this file */
  }
  return null;
}

async function collectRemoteTitles(input, fetchImpl, limit) {
  const titles = [];
  const add = (found) => {
    for (const title of found) {
      if (!titles.includes(title)) titles.push(title);
    }
  };
  for (const query of searchQueries(input)) {
    if (titles.length >= limit * 2) break;
    try {
      add(await commonsSearch(query, fetchImpl));
    } catch {
      /* keep going */
    }
  }
  if (titles.length) return titles;
  for (const query of searchQueries(input)) {
    if (titles.length >= limit * 2) break;
    try {
      add(await wikimediaRestSearch(query, fetchImpl));
    } catch {
      /* keep going */
    }
  }
  return titles;
}

async function searchAndSavePhotos(input, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const skipNet = !deps.fetchImpl && inUnitTest();
  const destDir = deps.destDir || path.join(config.publicDir, "static", "uploads");
  const limit = deps.limit || 4;
  const allowLibrary = Boolean(deps.publicDir) || !deps.fetchImpl;
  const local = allowLibrary && !(skipNet && !deps.publicDir) ? localLibraryPhotos(input, deps) : [];
  if (skipNet || local.length >= limit) return local.slice(0, limit);

  fs.mkdirSync(destDir, { recursive: true });
  const urls = [...local];
  const titles = await collectRemoteTitles(input, fetchImpl, limit);
  for (const title of titles) {
    if (urls.length >= limit) break;
    const name = `ai-${nanoid(10)}${extOf(title)}`;
    const dest = path.join(destDir, name);
    try {
      const ok = await downloadCommonsFile(title, dest, fetchImpl);
      if (ok) urls.push(`/static/uploads/${name}`);
    } catch {
      /* skip this file */
    }
  }
  if (urls.length >= limit) return urls.slice(0, limit);

  for (const query of searchQueries(input)) {
    if (urls.length >= limit) break;
    let found = [];
    try {
      found = await openverseSearch(query, fetchImpl);
    } catch {
      found = [];
    }
    for (const row of found) {
      if (urls.length >= limit) break;
      const name = `ai-${nanoid(10)}${extOf(row.title || row.url)}`;
      const dest = path.join(destDir, name);
      try {
        const ok = await downloadBuffer(row.url, dest, fetchImpl);
        if (ok) urls.push(`/static/uploads/${name}`);
      } catch {
        /* skip this file */
      }
    }
  }
  return urls.slice(0, limit);
}

async function draftRoute(input, deps = {}) {
  const title = String(input?.title || "").trim();
  if (!title) {
    const err = new Error("请填写标题");
    err.status = 400;
    throw err;
  }
  const payload = {
    title,
    region: String(input.region || "").trim(),
    days: Number(input.days) || 1,
    category: String(input.category || "").trim(),
    notes: String(input.notes || "").trim(),
  };
  let source = "template";
  let copy = null;
  const llm = deps.llmDraft || llmDraft;
  try {
    copy = await llm(payload, deps);
  } catch {
    copy = null;
  }
  if (copy) source = "llm";
  else copy = templateDraft(payload);

  let photos = [];
  const search = deps.searchPhotos || searchAndSavePhotos;
  try {
    photos = await search({ ...payload, category: copy.category }, deps);
  } catch {
    photos = [];
  }
  if (!Array.isArray(photos)) photos = [];

  return {
    ...copy,
    title,
    region: payload.region,
    days: payload.days,
    cover: photos[0] || "",
    gallery: photos,
    source,
    photoSource: photoSourceOf(photos),
  };
}

module.exports = {
  CATEGORIES,
  inferCategory,
  placeNameOf,
  templateDraft,
  parseJsonObject,
  normalizeLlmDraft,
  llmDraft,
  isUsablePhotoTitle,
  placeKeywords,
  matchPlaces,
  searchQueries,
  localLibraryPhotos,
  searchAndSavePhotos,
  draftRoute,
};
