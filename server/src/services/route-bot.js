const { nanoid } = require("nanoid");
const { getDb } = require("../db");
const { normalizeItinerary } = require("./story");
const { reviewOf } = require("./route-apply");
const { noticeBotRoute } = require("./notices");
const { scheduleRouteI18n } = require("./route-i18n");
const { downloadPhotoList } = require("./route-draft");

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

function hasOwn(body, keys) {
  return keys.some((key) => body && Object.prototype.hasOwnProperty.call(body, key) && body[key] != null);
}

function jsonList(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function localVideo(value) {
  const url = clip(typeof value === "string" ? value : value && (value.url || value.src), 300).split("?")[0];
  if (!url.startsWith("/static/") || url.includes("..")) return "";
  if (!/\.(mp4|webm|m4v)(\?|$)/i.test(url)) return "";
  return url;
}

function videosOf(body) {
  if (!body || (body.videos == null && body.video == null && body.videoUrl == null)) return undefined;
  const raw = body.videos ?? body.video ?? body.videoUrl;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (!list.length) return [];
  const url = localVideo(list[0]);
  if (!url) fail(400, "视频请先上传，使用返回的 /static/ 地址");
  return [url];
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

async function attachBotPhotos(draft, deps = {}) {
  const remote = [];
  for (const item of draft.photoSources || []) {
    if (item && item.url) remote.push(item.url);
  }
  if (!remote.length) return { cover: "", gallery: [] };
  const download = deps.downloadPhotos || downloadPhotoList;
  let saved = [];
  try {
    saved = await download(remote, deps);
  } catch {
    saved = [];
  }
  if (!Array.isArray(saved)) saved = [];
  saved = saved.filter((url) => String(url).startsWith("/static/")).slice(0, 8);
  return { cover: saved[0] || "", gallery: saved };
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
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    region: row.region || "",
    days: Number(row.days) || 1,
    category: row.category || "",
    difficulty: row.difficulty || "",
    reviewStatus: reviewOf(row),
    status: row.status || "off",
    source: row.source || "",
    sourceKey: row.source_key || "",
    sourceUrl: row.source_url || "",
    suggestedPrice: Number(row.suggested_price || 0),
    description: row.description || "",
    highlights: jsonList(row.highlights_json),
    itinerary: jsonList(row.itinerary_json),
    feeInclude: row.fee_include || "",
    feeExclude: row.fee_exclude || "",
    equipment: row.equipment || "",
    notices: row.notices || "",
    photoSources: jsonList(row.photo_sources_json),
    reviewNote: row.review_note || "",
    reviewedAt: row.reviewed_at || "",
    videos: jsonList(row.videos_json),
    ...extra,
  };
}

function writeDraft(db, id, draft, { reopen }) {
  db.prepare(
    `UPDATE routes SET title=?, subtitle=?, days=?, distance_km=?, difficulty=?, category=?, region=?, season=?, tags_json=?, cover=?, gallery_json=?, min_group_size=?, description=?, highlights_json=?, itinerary_json=?, fee_include=?, fee_exclude=?, equipment=?, notices=?, meetup_json=?, status='off', source='bot', source_url=?, source_key=?, suggested_price=?, photo_sources_json=?${
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
    JSON.stringify(draft.gallery || []),
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
      JSON.stringify(draft.gallery || []),
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

function draftFromRow(row) {
  return {
    title: row.title || "",
    subtitle: row.subtitle || "",
    days: Number(row.days) || 1,
    region: row.region || "",
    category: row.category || "山水",
    difficulty: row.difficulty || "休闲",
    season: row.season || "四季",
    distanceKm: Number(row.distance_km) || 0,
    tags: jsonList(row.tags_json),
    description: row.description || "",
    highlights: jsonList(row.highlights_json),
    itinerary: jsonList(row.itinerary_json),
    feeInclude: row.fee_include || "",
    feeExclude: row.fee_exclude || "",
    equipment: row.equipment || "",
    notices: row.notices || "",
    meetup: jsonList(row.meetup_json),
    suggestedPrice: Number(row.suggested_price) || 0,
    minGroupSize: Number(row.min_group_size) || 10,
    sourceUrl: row.source_url || "",
    sourceKey: row.source_key || "",
    photoSources: jsonList(row.photo_sources_json),
    cover: row.cover || "",
    gallery: jsonList(row.gallery_json),
  };
}

function keepOmitted(draft, existing, input) {
  const row = draftFromRow(existing);
  if (!hasOwn(input, ["title"])) draft.title = row.title;
  if (!hasOwn(input, ["subtitle"])) draft.subtitle = row.subtitle;
  if (!hasOwn(input, ["days"])) draft.days = row.days;
  if (!hasOwn(input, ["region", "city"])) draft.region = row.region;
  if (!hasOwn(input, ["category"])) draft.category = row.category;
  if (!hasOwn(input, ["difficulty"])) draft.difficulty = row.difficulty;
  if (!hasOwn(input, ["season"])) draft.season = row.season;
  if (!hasOwn(input, ["distanceKm", "distance_km"])) draft.distanceKm = row.distanceKm;
  if (!hasOwn(input, ["tags"])) draft.tags = row.tags;
  if (!hasOwn(input, ["description"])) draft.description = row.description;
  if (!hasOwn(input, ["highlights"])) draft.highlights = row.highlights;
  if (!hasOwn(input, ["itinerary"])) draft.itinerary = row.itinerary;
  if (!hasOwn(input, ["feeInclude", "fee_include"])) draft.feeInclude = row.feeInclude;
  if (!hasOwn(input, ["feeExclude", "fee_exclude"])) draft.feeExclude = row.feeExclude;
  if (!hasOwn(input, ["equipment"])) draft.equipment = row.equipment;
  if (!hasOwn(input, ["notices"])) draft.notices = row.notices;
  if (!hasOwn(input, ["meetupPoints", "meetup_points"])) draft.meetup = row.meetup;
  if (!hasOwn(input, ["suggestedPrice", "suggested_price", "price"])) draft.suggestedPrice = row.suggestedPrice;
  if (!hasOwn(input, ["minGroupSize", "min_group_size"])) draft.minGroupSize = row.minGroupSize;
  if (!hasOwn(input, ["sourceUrl", "source_url"])) draft.sourceUrl = row.sourceUrl;
  if (!hasOwn(input, ["photoSources", "photo_sources", "photos"])) draft.photoSources = row.photoSources;
}

function keepStoredPhotos(draft, existing) {
  if (!existing || !String(existing.cover || "").startsWith("/static/")) {
    draft.gallery = [];
    return;
  }
  draft.cover = existing.cover;
  try {
    const gallery = JSON.parse(existing.gallery_json || "[]");
    draft.gallery = Array.isArray(gallery) ? gallery : [];
  } catch {
    draft.gallery = [];
  }
}

async function ingestRoute(body, deps) {
  const input = body || {};
  const db = getDb();
  const explicitKey = clip(input.sourceKey || input.source_key, 80);
  let existing = explicitKey ? db.prepare("SELECT * FROM routes WHERE source_key=?").get(explicitKey) : null;
  if (existing && existing.source !== "bot") fail(409, "来源键已被占用");
  if (existing && reviewOf(existing) === "approved") {
    return viewOf(existing, { updated: false, message: "已通过，未覆盖" });
  }
  const draftInput = { ...input };
  if (existing) {
    if (!hasOwn(input, ["title"])) draftInput.title = existing.title;
    if (!hasOwn(input, ["region", "city"])) draftInput.region = existing.region;
  }
  const draft = draftOf(draftInput);
  if (!existing) {
    existing = db.prepare("SELECT * FROM routes WHERE source_key=?").get(draft.sourceKey);
    if (existing && existing.source !== "bot") fail(409, "来源键已被占用");
    if (existing && reviewOf(existing) === "approved") {
      return viewOf(existing, { updated: false, message: "已通过，未覆盖" });
    }
  }
  if (existing) keepOmitted(draft, existing, input);
  const incomingVideos = videosOf(input);
  let videos = incomingVideos;
  if (videos === undefined) {
    videos = jsonList(existing && existing.videos_json);
  }
  const sendPhotos = hasOwn(input, ["photoSources", "photo_sources", "photos"]);
  if (sendPhotos || !existing) {
    const photos = await attachBotPhotos(draft, deps);
    if (photos.cover) {
      draft.cover = photos.cover;
      draft.gallery = photos.gallery;
    } else {
      keepStoredPhotos(draft, existing);
    }
  } else {
    draft.cover = existing.cover || "";
    draft.gallery = jsonList(existing.gallery_json);
  }
  const reopen = !existing || reviewOf(existing) === "rejected";
  let id = existing && existing.id;
  if (existing) writeDraft(db, existing.id, draft, { reopen });
  else id = insertDraft(db, draft);
  db.prepare("UPDATE routes SET videos_json=? WHERE id=?").run(JSON.stringify(videos || []), id);
  const row = db.prepare("SELECT * FROM routes WHERE id=?").get(id);
  scheduleRouteI18n(id);
  if (reopen) noticeBotRoute(row);
  return viewOf(row, {
    updated: true,
    message: existing && !reopen ? "已更新待审稿" : "已收入待审，未上架",
  });
}

async function fillMissingBotPhotos(deps) {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, title, region, category, photo_sources_json FROM routes WHERE source='bot' AND IFNULL(cover,'')='' AND IFNULL(review_status,'pending')!='approved'"
    )
    .all();
  let filled = 0;
  for (const row of rows) {
    let sources = [];
    try {
      sources = JSON.parse(row.photo_sources_json || "[]");
    } catch {
      sources = [];
    }
    const photos = await attachBotPhotos(
      { title: row.title, region: row.region, category: row.category, photoSources: sources },
      deps
    );
    if (!photos.cover) continue;
    const info = db
      .prepare("UPDATE routes SET cover=?, gallery_json=? WHERE id=? AND IFNULL(cover,'')=''")
      .run(photos.cover, JSON.stringify(photos.gallery), row.id);
    if (info.changes) filled += 1;
  }
  return filled;
}

function listBotRoutes(review) {
  const status = String(review || "").trim();
  if (status && !["pending", "approved", "rejected"].includes(status)) {
    fail(400, "review 只能是 pending、approved 或 rejected");
  }
  const db = getDb();
  const rows = status
    ? db
        .prepare(
          "SELECT * FROM routes WHERE source='bot' AND IFNULL(review_status,'pending')=? ORDER BY id DESC"
        )
        .all(status)
    : db.prepare("SELECT * FROM routes WHERE source='bot' ORDER BY id DESC").all();
  return rows.map((row) => viewOf(row));
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

module.exports = { ingestRoute, botRoute, listBotRoutes, fillMissingBotPhotos };
