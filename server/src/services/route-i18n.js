const crypto = require("crypto");
const config = require("../config");
const { getDb } = require("../db");

const SKIP_FIELDS = new Set([
  "city",
  "region",
  "category",
  "difficulty",
  "season",
  "status",
  "channel",
  "code",
  "phone",
  "nickname",
  "realName",
  "idCard",
  "idCardMasked",
  "token",
  "cover",
  "url",
  "photo",
  "avatar",
  "embedUrl",
  "plateNo",
  "joinCode",
  "startDate",
  "endDate",
  "meetupTime",
  "password",
  "username",
  "openid",
  "tags",
  "playTags",
]);

const pending = new Set();
const failedAt = new Map();
let active = 0;
let lastScan = 0;

function parseJson(raw, fallback) {
  try {
    const value = JSON.parse(raw || "");
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function parseI18n(raw) {
  const value = parseJson(raw, {});
  const en = value && typeof value.en === "object" && value.en ? value.en : {};
  return { sourceHash: String(value.sourceHash || ""), en };
}

function addText(bucket, text) {
  const raw = String(text || "").trim();
  if (!raw) return;
  const parts = [raw];
  for (const piece of raw.split(/\n+/)) {
    const line = piece.trim();
    if (line && line !== raw) parts.push(line);
  }
  for (const piece of parts) {
    if (piece.length < 4 || piece.length > 4000) continue;
    if (!/[\u4e00-\u9fff]/.test(piece)) continue;
    bucket.add(piece);
  }
}

function collectRouteStrings(row) {
  const bucket = new Set();
  if (!row) return [];
  addText(bucket, row.title);
  addText(bucket, row.subtitle);
  addText(bucket, row.description);
  addText(bucket, row.fee_include);
  addText(bucket, row.fee_exclude);
  addText(bucket, row.equipment);
  addText(bucket, row.notices);
  for (const piece of String(row.equipment || "").split(/[、，,;；/\n]+/)) addText(bucket, piece);
  for (const item of parseJson(row.highlights_json, [])) addText(bucket, item);
  for (const step of parseJson(row.itinerary_json, [])) {
    if (!step || typeof step !== "object") continue;
    addText(bucket, step.title);
    addText(bucket, step.detail || step.body);
  }
  for (const block of parseJson(row.story_json, [])) {
    if (!block || typeof block !== "object") continue;
    addText(bucket, block.body || block.text);
    addText(bucket, block.caption);
  }
  for (const point of parseJson(row.meetup_json, [])) {
    if (!point || typeof point !== "object") continue;
    addText(bucket, point.name);
    addText(bucket, point.address);
  }
  return [...bucket];
}

function sourceHash(strings) {
  return crypto.createHash("sha1").update([...strings].sort().join("\n")).digest("hex");
}

function isFresh(row) {
  const strings = collectRouteStrings(row);
  const saved = parseI18n(row && row.i18n_json);
  if (saved.sourceHash !== sourceHash(strings)) return false;
  return strings.every((item) => saved.en[item]);
}

function parseModelJson(text) {
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

function pickMap(parsed, strings) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const score = (obj) => strings.filter((item) => typeof obj[item] === "string").length;
  if (score(parsed)) return parsed;
  for (const value of Object.values(parsed)) {
    if (value && typeof value === "object" && !Array.isArray(value) && score(value)) return value;
  }
  return null;
}

function acceptTranslation(source, value) {
  const text = String(value || "").trim();
  if (!text || text === source) return "";
  if (!/[A-Za-z]/.test(text)) return "";
  if (text.length > 4000) return "";
  return text;
}

async function callModel(strings, deps) {
  const apiKey = deps.apiKey != null ? deps.apiKey : config.ai.apiKey;
  if (!apiKey || !strings.length) return {};
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const baseUrl = String(deps.baseUrl || config.ai.baseUrl || "").replace(/\/$/, "");
  const model = deps.model || config.ai.model;
  const prompt = [
    "把下面每条中文译成自然英文，用于北京周边户外拼团的线路介绍。",
    "只输出 JSON 对象：键必须是原文，值是英文。",
    "地名用常见英文或拼音，例如慕田峪写 Mutianyu。",
    "品牌名「同行者众」保持原文，不要翻译。",
    "数字、时间、价格保持不变。不要新增或漏掉键。",
    JSON.stringify(strings),
  ].join("\n");
  const res = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
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
  const parsed = parseModelJson(data.choices?.[0]?.message?.content);
  const map = pickMap(parsed, strings);
  if (!map) return null;
  const out = {};
  for (const item of strings) {
    const text = acceptTranslation(item, map[item]);
    if (text) out[item] = text;
  }
  return out;
}

function saveI18n(db, routeId, strings, en) {
  const kept = {};
  for (const item of strings) {
    if (en[item]) kept[item] = en[item];
  }
  const done = strings.every((item) => kept[item]);
  db.prepare("UPDATE routes SET i18n_json=? WHERE id=?").run(
    JSON.stringify({ sourceHash: done ? sourceHash(strings) : "", en: kept }),
    routeId
  );
  return kept;
}

async function translateRouteById(routeId, deps = {}) {
  const db = deps.db || getDb();
  const row = db.prepare("SELECT * FROM routes WHERE id=?").get(routeId);
  if (!row) return null;
  const strings = collectRouteStrings(row);
  const prev = parseI18n(row.i18n_json);
  const en = {};
  for (const item of strings) {
    if (prev.en[item]) en[item] = prev.en[item];
  }
  const missing = strings.filter((item) => !en[item]);
  if (!missing.length) {
    saveI18n(db, routeId, strings, en);
    return en;
  }
  const apiKey = deps.apiKey != null ? deps.apiKey : config.ai.apiKey;
  if (!apiKey) return null;
  try {
    const chunkSize = 30;
    for (let i = 0; i < missing.length; i += chunkSize) {
      const chunk = missing.slice(i, i + chunkSize);
      const translated = await callModel(chunk, deps);
      if (!translated) {
        saveI18n(db, routeId, strings, en);
        return null;
      }
      Object.assign(en, translated);
    }
  } catch {
    saveI18n(db, routeId, strings, en);
    return null;
  }
  const saved = saveI18n(db, routeId, strings, en);
  return strings.every((item) => saved[item]) ? saved : null;
}

function autoOn() {
  return process.env.ROUTE_I18N_AUTO !== "0" && Boolean(config.ai.apiKey);
}

function scheduleRouteI18n(routeId) {
  const id = Number(routeId);
  if (!id || !autoOn() || pending.has(id)) return;
  const last = failedAt.get(id) || 0;
  if (Date.now() - last < 10 * 60 * 1000) return;
  pending.add(id);
  pump();
}

function pump() {
  if (active >= 1) return;
  const id = pending.values().next().value;
  if (id == null) return;
  pending.delete(id);
  active += 1;
  translateRouteById(id)
    .then((result) => {
      if (result == null) failedAt.set(id, Date.now());
      else failedAt.delete(id);
    })
    .catch(() => failedAt.set(id, Date.now()))
    .finally(() => {
      active -= 1;
      pump();
    });
}

function queueStaleRoutes() {
  if (!autoOn()) return;
  if (Date.now() - lastScan < 30000) return;
  lastScan = Date.now();
  const rows = getDb().prepare("SELECT * FROM routes").all();
  for (const row of rows) {
    if (isFresh(row)) continue;
    scheduleRouteI18n(row.id);
    if (pending.size >= 8) break;
  }
}

function englishMap(db) {
  const map = {};
  const rows = (db || getDb()).prepare("SELECT i18n_json FROM routes WHERE i18n_json IS NOT NULL AND i18n_json != ''").all();
  for (const row of rows) Object.assign(map, parseI18n(row.i18n_json).en);
  return map;
}

function localizeString(value, map, keys) {
  if (!value || !/[\u4e00-\u9fff]/.test(value)) return value;
  if (Object.prototype.hasOwnProperty.call(map, value)) return map[value];
  const trimmed = value.trim();
  if (trimmed !== value && Object.prototype.hasOwnProperty.call(map, trimmed)) {
    return value.replace(trimmed, map[trimmed]);
  }
  let out = value;
  for (const key of keys) {
    if (!out.includes(key)) continue;
    out = out.split(key).join(map[key]);
  }
  return out;
}

function walk(value, map, keys, field) {
  if (SKIP_FIELDS.has(field)) return value;
  if (typeof value === "string") return localizeString(value, map, keys);
  if (Array.isArray(value)) return value.map((item) => walk(item, map, keys, ""));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = walk(item, map, keys, key);
    return out;
  }
  return value;
}

function applyEnglishPayload(body, map) {
  const phrases = map || englishMap();
  const keys = Object.keys(phrases)
    .filter((key) => key.length >= 4 && phrases[key])
    .sort((a, b) => b.length - a.length);
  if (!keys.length) return body;
  return walk(body, phrases, keys, "");
}

function requestLang(req) {
  const raw = String((req && (req.get?.("x-lang") || req.query?.lang)) || "").toLowerCase();
  if (raw === "en" || raw.startsWith("en-")) return "en";
  if (raw === "tw" || raw === "zh-tw" || raw === "zh-hant" || raw === "zh-hk") return "tw";
  return "zh";
}

function localizeEnglishResponse(req, res, next) {
  const path = req.path || "";
  if (!path.startsWith("/api") || path.startsWith("/api/admin")) return next();
  if (requestLang(req) !== "en") return next();
  const orig = res.json.bind(res);
  res.json = (body) => {
    try {
      queueStaleRoutes();
      body = applyEnglishPayload(body);
    } catch {
      /* 翻译失败仍返回中文原文 */
    }
    return orig(body);
  };
  next();
}

module.exports = {
  collectRouteStrings,
  sourceHash,
  parseI18n,
  isFresh,
  translateRouteById,
  scheduleRouteI18n,
  applyEnglishPayload,
  requestLang,
  localizeEnglishResponse,
  englishMap,
};
