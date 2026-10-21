const { nanoid } = require("nanoid");
const { getDb } = require("../db");
const { normalizeItinerary } = require("./story");
const { reviewOf } = require("./route-apply");
const { noticeBotRoute } = require("./notices");
const { scheduleRouteI18n } = require("./route-i18n");

const CATEGORIES = ["长城", "登山", "山水", "玩水", "文化", "草原", "海滨"];

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function clip(value, max) {
  return String(value || "").trim().slice(0, max);
}

function httpUrl(value, max = 500) {
  const url = clip(value, max);
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) return "";
  return url;
}

function localPhoto(value) {
  const url = clip(value, 300);
  return url.startsWith("/static/") ? url : "";
}

function sourceKeyOf(body, title, region) {
  const explicit = clip(body.sourceKey || body.source_key, 80);
  if (explicit) return explicit;
  const url = httpUrl(body.sourceUrl || body.source_url, 180);
  if (url) return `url:${url}`.slice(0, 200);
  return `place:${title}|${region}`.slice(0, 200);
}

function photoSourcesOf(body) {
  const raw = body.photoSources || body.photo_sources || body.photos || [];
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const url = httpUrl(typeof item === "string" ? item : item && (item.url || item.src), 500);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const caption = clip(typeof item === "object" && item ? item.caption : "", 40);
    out.push(caption ? { url, caption } : { url });
    if (out.length >= 8) break;
  }
  return out;
}

function meetupOf(body) {
  const raw = body.meetupPoints || body.meetup_points || [];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item) => {
      const name = clip(typeof item === "string" ? item : item && (item.name || item.point), 40);
      if (!name) return null;
      return { name };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function highlightsOf(body) {
  const raw = Array.isArray(body.highlights) ? body.highlights : [];
  return raw
    .map((item) => clip(typeof item === "string" ? item : item && (item.text || item.title), 80))
    .filter(Boolean)
    .slice(0, 6);
}

function tagsOf(body) {
  const raw = Array.isArray(body.tags) ? body.tags : [];
  return raw
    .map((item) => clip(item, 12))
    .filter(Boolean)
    .slice(0, 8);
}

function draftOf(body) {
  const input = body || {};
  const title = clip(input.title, 40);
  if (title.length < 2) fail(400, "请填写线路标题");
  const region = clip(input.region || input.city, 60);
  if (!region) fail(400, "请填写地区");
  const daysRaw = String(input.days || "") === "multi" ? 5 : Number(input.days) || 1;
  if (![1, 2, 3, 5].includes(daysRaw)) fail(400, "天数只支持 1、2、3 或 5");
  const categoryHint = clip(input.category, 8);
  const category = CATEGORIES.includes(categoryHint) ? categoryHint : "山水";
  const difficulty = /进阶|高强度/.test(clip(input.difficulty, 8)) ? "进阶" : "休闲";
  const suggested = Math.round(Number(input.suggestedPrice ?? input.suggested_price ?? input.price) || 0);
  if (suggested < 0 || suggested > 99999) fail(400, "建议价请填 0 到 99999 的整数");
  const minGroup = Math.round(Number(input.minGroupSize || input.min_group_size) || 10);
  if (minGroup < 1 || minGroup > 50) fail(400, "成团人数请填 1 到 50");
  const itinerary = normalizeItinerary(input.itinerary)
    .slice(0, 16)
    .map((item) => ({
      time: clip(item.time, 20),
      title: clip(item.title, 40),
      detail: clip(item.detail, 500),
      photo: localPhoto(item.photo),
    }));
  return {
    title,
    subtitle: clip(input.subtitle, 40),
    days: daysRaw,
    region,
    category,
    difficulty,
    season: clip(input.season, 20) || "四季",
    distanceKm: Math.max(0, Math.min(999, Math.round(Number(input.distanceKm || input.distance_km) || 0))),
    tags: tagsOf(input),
    description: clip(input.description, 4000),
    highlights: highlightsOf(input),
    itinerary,
    feeInclude: clip(input.feeInclude || input.fee_include, 1000),
    feeExclude: clip(input.feeExclude || input.fee_exclude, 1000),
    equipment: clip(input.equipment, 1000),
    notices: clip(input.notices, 1000),
    meetup: meetupOf(input),
    suggestedPrice: suggested,
    minGroupSize: minGroup,
    sourceUrl: httpUrl(input.sourceUrl || input.source_url, 500),
    sourceKey: sourceKeyOf(input, title, region),
    photoSources: photoSourcesOf(input),
    cover: localPhoto(input.cover),
  };
}

function viewOf(row, extra = {}) {
  let photos = [];
  try {
    photos = JSON.parse(row.photo_sources_json || "[]");
  } catch {
    photos = [];
  }
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    region: row.region || "",
    reviewStatus: reviewOf(row),
    status: row.status || "off",
    source: row.source || "",
    sourceKey: row.source_key || "",
    sourceUrl: row.source_url || "",
    suggestedPrice: Number(row.suggested_price || 0),
    photoSources: Array.isArray(photos) ? photos : [],
    reviewNote: row.review_note || "",
    ...extra,
  };
}

function writeDraft(db, id, draft, { reopen }) {
  db.prepare(
    `UPDATE routes SET title=?, subtitle=?, days=?, distance_km=?, difficulty=?, category=?, region=?, season=?, tags_json=?, cover=?, min_group_size=?, description=?, highlights_json=?, itinerary_json=?, fee_include=?, fee_exclude=?, equipment=?, notices=?, meetup_json=?, status='off', source='bot', source_url=?, source_key=?, suggested_price=?, photo_sources_json=?${
      reopen ? ", review_status='pending'" : ""
    } WHERE id=?`
  ).run(
    draft.title,
    draft.subtitle,
    draft.days,
    draft.distanceKm,
    draft.difficulty,
    draft.category,
    draft.region,
    draft.season,
    JSON.stringify(draft.tags),
    draft.cover,
    draft.minGroupSize,
    draft.description,
    JSON.stringify(draft.highlights),
    JSON.stringify(draft.itinerary),
    draft.feeInclude,
    draft.feeExclude,
    draft.equipment,
    draft.notices,
    JSON.stringify(draft.meetup),
    draft.sourceUrl,
    draft.sourceKey,
    draft.suggestedPrice,
    JSON.stringify(draft.photoSources),
    id
  );
}

function insertDraft(db, draft) {
  const info = db
    .prepare(
      `INSERT INTO routes (code,title,subtitle,days,distance_km,difficulty,category,region,season,tags_json,cover,gallery_json,min_group_size,description,highlights_json,itinerary_json,fee_include,fee_exclude,equipment,notices,meetup_json,status,review_status,bounty_status,bounty_amount,source,source_url,source_key,suggested_price,photo_sources_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      `B${nanoid(8)}`,
      draft.title,
      draft.subtitle,
      draft.days,
      draft.distanceKm,
      draft.difficulty,
      draft.category,
      draft.region,
      draft.season,
      JSON.stringify(draft.tags),
      draft.cover,
      "[]",
      draft.minGroupSize,
      draft.description,
      JSON.stringify(draft.highlights),
      JSON.stringify(draft.itinerary),
      draft.feeInclude,
      draft.feeExclude,
      draft.equipment,
      draft.notices,
      JSON.stringify(draft.meetup),
      "off",
      "pending",
      "",
      0,
      "bot",
      draft.sourceUrl,
      draft.sourceKey,
      draft.suggestedPrice,
      JSON.stringify(draft.photoSources)
    );
  return Number(info.lastInsertRowid);
}

function ingestRoute(body) {
  const draft = draftOf(body);
  const db = getDb();
  const existing = db.prepare("SELECT * FROM routes WHERE source_key=?").get(draft.sourceKey);
  if (existing && existing.source !== "bot") fail(409, "来源键已被占用");
  if (existing && reviewOf(existing) === "approved") {
    return viewOf(existing, { updated: false, message: "已通过，未覆盖" });
  }
  const reopen = !existing || reviewOf(existing) === "rejected";
  let id = existing && existing.id;
  if (existing) writeDraft(db, existing.id, draft, { reopen });
  else id = insertDraft(db, draft);
  const row = db.prepare("SELECT * FROM routes WHERE id=?").get(id);
  scheduleRouteI18n(id);
  if (reopen) noticeBotRoute(row);
  return viewOf(row, {
    updated: true,
    message: existing && !reopen ? "已更新待审稿" : "已收入待审，未上架",
  });
}

function botRoute(idOrKey) {
  const db = getDb();
  const key = clip(idOrKey, 200);
  const row = /^\d+$/.test(key)
    ? db.prepare("SELECT * FROM routes WHERE id=? AND source='bot'").get(Number(key))
    : db.prepare("SELECT * FROM routes WHERE source_key=? AND source='bot'").get(key);
  if (!row) fail(404, "线路不存在");
  return viewOf(row);
}

module.exports = { ingestRoute, botRoute };
