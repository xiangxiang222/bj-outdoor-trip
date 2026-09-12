const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");
const config = require("../config");
const { PLACE_ALBUMS } = require("../seed/place-albums-config");

const CATEGORIES = ["长城", "登山", "山水", "玩水", "文化", "草原", "海滨"];
const UA = "bj-outdoor-trip/1.0 (route draft; https://github.com/xiangxiang222/bj-outdoor-trip)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
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

function stripTags(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function isUsableSearchPhoto(title, url) {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return false;
  if (/\.svg(\?|$)/i.test(u)) return false;
  const t = stripTags(title);
  if (/location map|coat of arms|logo|icon|flag of|banner|qr code|diagram|wikidata|svg map|route map|地图|示意图|图标|二维码|路线图/i.test(t)) {
    return false;
  }
  return true;
}

function extOf(titleOrUrl) {
  const s = String(titleOrUrl || "").toLowerCase();
  if (/f=png|\.png(\?|$)/.test(s)) return ".png";
  if (/f=webp|\.webp(\?|$)/.test(s)) return ".webp";
  if (/f=gif|\.gif(\?|$)/.test(s)) return ".gif";
  return ".jpg";
}

function searchHeaders(referer) {
  return {
    "User-Agent": BROWSER_UA,
    Accept: "application/json,text/javascript,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Referer: referer,
  };
}

function downloadHeaders(url) {
  const headers = {
    "User-Agent": BROWSER_UA,
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  };
  if (/baidu\.com|bdimg\.com/.test(url)) headers.Referer = "https://image.baidu.com/";
  else if (/so\.com|qhimgs/.test(url)) headers.Referer = "https://image.so.com/";
  return headers;
}

async function readJson(res) {
  if (!res || typeof res.json !== "function") return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
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
    extras.push(...placeKeywords(cfg));
  }
  return [...new Set([place, ...extras].filter((q) => q && String(q).length >= 2))].slice(0, 3);
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

async function baiduImageSearch(query, fetchImpl) {
  const url =
    "https://image.baidu.com/search/wisejsonala?" +
    new URLSearchParams({
      tn: "wisejsonala",
      ie: "utf-8",
      word: String(query || ""),
      pn: "0",
      rn: "10",
    });
  const res = await fetchImpl(url, {
    headers: searchHeaders("https://image.baidu.com/"),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const data = await readJson(res);
  if (!data || data.antiFlag || data.message === "Forbid spider access") return [];
  return (data.data || [])
    .map((row) => ({
      title: stripTags(row?.title || row?.ori_title || "photo.jpg"),
      url: String(row?.thumburl || row?.hoverurl || row?.thumbnail_url || "").trim(),
    }))
    .filter((row) => isUsableSearchPhoto(row.title, row.url));
}

async function soImageSearch(query, fetchImpl) {
  const url =
    "https://image.so.com/j?" +
    new URLSearchParams({
      q: String(query || ""),
      src: "srp",
      sn: "0",
      pn: "10",
    });
  const res = await fetchImpl(url, {
    headers: searchHeaders("https://image.so.com/"),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const data = await readJson(res);
  return (data?.list || [])
    .map((row) => ({
      title: stripTags(row?.title || "photo.jpg"),
      url: String(row?.img || row?.thumb || "").trim(),
    }))
    .filter((row) => isUsableSearchPhoto(row.title, row.url));
}

async function downloadBuffer(url, destPath, fetchImpl) {
  const imgRes = await fetchImpl(url, {
    headers: downloadHeaders(url),
    redirect: "follow",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!imgRes.ok) return null;
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (buf.length < MIN_PHOTO_BYTES) return null;
  fs.writeFileSync(destPath, buf);
  return destPath;
}

async function collectRemotePhotos(input, fetchImpl) {
  const seen = new Set();
  const rows = [];
  const add = (found) => {
    for (const row of found) {
      if (!row?.url || seen.has(row.url)) continue;
      seen.add(row.url);
      rows.push(row);
    }
  };
  for (const query of searchQueries(input)) {
    try {
      add(await baiduImageSearch(query, fetchImpl));
    } catch {
      /* keep going */
    }
  }
  if (rows.length) return rows;
  for (const query of searchQueries(input)) {
    try {
      add(await soImageSearch(query, fetchImpl));
    } catch {
      /* keep going */
    }
  }
  return rows;
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
  const found = await collectRemotePhotos(input, fetchImpl);
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
  isUsableSearchPhoto,
  placeKeywords,
  matchPlaces,
  searchQueries,
  localLibraryPhotos,
  searchAndSavePhotos,
  draftRoute,
};
