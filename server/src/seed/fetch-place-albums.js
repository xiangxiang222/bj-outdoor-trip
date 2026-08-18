const fs = require("fs");
const path = require("path");
const { PLACE_ALBUMS } = require("./place-albums-config");
const { COMMONS_FILES, downloadOne, sleep } = require("./fetch-place-photos");

const UA = "bj-outdoor-trip/1.0 (local demo; cover images)";
const TARGET = 14;
const SEARCH_SLEEP_MS = 1600;
const INDEX_PATH = path.join(__dirname, "place-albums.json");
const TITLES_PATH = path.join(__dirname, "place-album-titles.json");

function stripFile(title) {
  return String(title || "").replace(/^File:/, "").trim();
}

function isUsablePhoto(title, place) {
  const t = stripFile(title);
  if (!t) return false;
  if (/\.(svg|pdf|djvu|webm|ogv|stl|wav|ogg|mid|opus|png)$/i.test(t)) return false;
  if (!/\.(jpe?g|tiff?|gif|webp)$/i.test(t)) return false;
  if (/location map|coat of arms|logo|icon|flag of|banner|qr code|diagram|wikidata|svg map|route map|admiralty chart/i.test(t)) {
    return false;
  }
  if (/metro|shanghai|xinzhuang|locomotive|railway halt|df7 |mycokeys|cytospora|disease symptoms|limousines|hanting hotel|american forests|hinterhof|boxerspamphlet|shenzhen|whitebark pine|big mountain resort|toll plaza|expwy|expressway|jingyu|tricycle|三轮|收费站|高速公路/i.test(t)) {
    return false;
  }
  const need = {
    lingshan: /灵山|lingshan/i,
    shangfang: /上方山云水洞|云水洞|shangfangshan|上方山国家森林|yunshui/i,
    jingdong: /京东大峡谷|jingdong|石林峡|shilinxia|ufo platform|haizi reservoir/i,
    tianyun: /tianyun|天云山/i,
    qinglong: /qinglongxia|青龙峡|龙峡湖|longxia|black dragon valley/i,
    ulanbutong: /乌兰布统|ulan butong|wulanbutong|坝上雪原/i,
    zhangbei: /zhangbei|张北|grass skyline/i,
    fengning: /fengning|丰宁|京北第一草原|jing bei meadow/i,
    shuanglong: /shuanglong|双龙峡/i,
    yanqi: /yanqi|雁栖湖/i,
    beidaihe: /beidaihe|北戴河/i,
    fenghuang: /fenghuangling|凤凰岭/i,
    juyong: /juyong|居庸/i,
    shanhaiguan: /shanhaiguan|山海关|shanhai pass|shan-hai-kwan|天下第一关/i,
  }[place];
  if (need && !need.test(t)) return false;
  if (place === "shangfang" && /segalen|recueil|nanchang|pengjiaqiao|shihu|青瓷|石棺|suchong/i.test(t)) return false;
  if (place === "jingdong" && /jinhai lake station|金海湖站|line 5/i.test(t)) return false;
  if (place === "juyong" && /guang yu tu|loc 2008623187/i.test(t)) return false;
  if (place === "wutai" && /administrative committee|visitor center|hotel at wutai|jìn h/i.test(t)) return false;
  if (place === "chengde" && /whitebark|chairlift on big mountain/i.test(t)) return false;
  if (place === "xuankong" && /寨色村|罗兀城/i.test(t)) return false;
  if (place === "ulanbutong" && /qing artillery|old street/i.test(t)) return false;
  if (place === "baishi" && /battle at great wall|liao stele/i.test(t)) return false;
  if (place === "shanhaiguan" && /师生合影|东北军|国民军|辽沈|野战军|japanese capture|railway station|little princess|introduction for/i.test(t)) return false;
  if (place === "qinglong" && /蝗虫|damn|montañas qinglong|altura nueva/i.test(t)) return false;
  if (place === "lingshan" && /flycatcher|larix principis|toll plaza/i.test(t)) return false;
  if (place === "yesanpo" && /lamb to the slaughter|corn |goats \(/i.test(t)) return false;
  return true;
}

async function commonsGet(params) {
  const url = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ format: "json", ...params });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429) {
      await sleep(2000 * attempt);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  throw new Error("HTTP 429");
}

async function searchFiles(query, limit = 16) {
  const data = await commonsGet({
    action: "query",
    list: "search",
    srsearch: `${query} filetype:bitmap`,
    srnamespace: "6",
    srlimit: String(limit),
  });
  return (data.query?.search || []).map((row) => stripFile(row.title));
}

async function categoryFiles(category, limit = 20) {
  const data = await commonsGet({
    action: "query",
    list: "categorymembers",
    cmtitle: category,
    cmtype: "file",
    cmlimit: String(limit),
  });
  return (data.query?.categorymembers || []).map((row) => stripFile(row.title));
}

function knownTitles() {
  const set = new Set(Object.values(COMMONS_FILES).map(stripFile));
  try {
    const saved = JSON.parse(fs.readFileSync(TITLES_PATH, "utf8"));
    for (const titles of Object.values(saved)) {
      for (const t of titles) set.add(stripFile(t));
    }
  } catch {
    /* first run */
  }
  return set;
}

async function collectTitlesForPlace(place, cfg, usedTitles) {
  const found = [];
  const add = (title) => {
    const t = stripFile(title);
    if (!t || usedTitles.has(t) || found.includes(t) || !isUsablePhoto(t, place)) return;
    usedTitles.add(t);
    found.push(t);
  };
  for (const cat of cfg.categories || []) {
    if (found.length >= TARGET) break;
    try {
      const files = await categoryFiles(cat);
      files.forEach(add);
      console.log("  cat", cat, files.length);
    } catch (err) {
      console.warn("  cat fail", cat, err.message);
    }
    await sleep(SEARCH_SLEEP_MS);
  }
  for (const q of cfg.queries || []) {
    if (found.length >= TARGET) break;
    try {
      const files = await searchFiles(q);
      files.forEach(add);
      console.log("  q", q, files.length);
    } catch (err) {
      console.warn("  q fail", q, err.message);
    }
    await sleep(SEARCH_SLEEP_MS);
  }
  return found.slice(0, TARGET);
}

async function searchAll() {
  const usedTitles = knownTitles();
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(TITLES_PATH, "utf8"));
  } catch {
    saved = {};
  }
  for (const [place, cfg] of Object.entries(PLACE_ALBUMS)) {
    const have = (saved[place] || []).filter((t) => isUsablePhoto(t, place));
    const need = TARGET - (cfg.existing.length + have.length);
    console.log("\n##", place, "existing", cfg.existing.length, "saved", have.length, "need", Math.max(need, 0));
    if (need <= 0) continue;
    const more = await collectTitlesForPlace(place, cfg, usedTitles);
    saved[place] = [...have, ...more.filter((t) => !have.includes(t))];
    fs.writeFileSync(TITLES_PATH, JSON.stringify(saved, null, 2));
  }
  return saved;
}

async function imageInfoBatch(titles) {
  const map = {};
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    try {
      const data = await commonsGet({
        action: "query",
        titles: chunk.map((t) => `File:${t}`).join("|"),
        prop: "imageinfo",
        iiprop: "url",
        iiurlwidth: "1280",
      });
      for (const page of Object.values(data.query?.pages || {})) {
        const title = stripFile(page.title);
        const info = page.imageinfo?.[0];
        if (info?.thumburl || info?.url) map[title] = info.thumburl || info.url;
      }
    } catch (err) {
      console.warn("imageinfo fail", err.message);
      await sleep(8000);
    }
    await sleep(1200);
  }
  return map;
}

async function saveBuffer(key, url, destDir) {
  const dest = path.join(destDir, `${key}.jpg`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 15000) return dest;
  let lastErr = "";
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
      if (res.status === 429) {
        lastErr = "HTTP 429";
        await sleep(6000 * attempt);
        if (attempt >= 2) break;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 15000) throw new Error(`tiny ${buf.length}`);
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(dest, buf);
      console.log("ok", key, buf.length);
      return dest;
    } catch (err) {
      lastErr = err.message || String(err);
      await sleep(3000 * attempt);
    }
  }
  throw new Error(lastErr);
}

async function downloadAll(titlesByPlace) {
  const destDir = path.join(__dirname, "../../public/static/photos");
  fs.mkdirSync(destDir, { recursive: true });
  const albums = {};
  for (const [place, cfg] of Object.entries(PLACE_ALBUMS)) {
    const keys = [...cfg.existing];
    for (let i = 1; i <= 40; i += 1) {
      const key = `${place}_${String(i).padStart(2, "0")}`;
      const dest = path.join(destDir, `${key}.jpg`);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 15000 && !keys.includes(key)) keys.push(key);
    }
    if (keys.length >= TARGET) {
      albums[place] = keys.slice(0, TARGET);
      fs.writeFileSync(INDEX_PATH, JSON.stringify(albums, null, 2));
      console.log("album", place, albums[place].length, "(disk)");
      continue;
    }
    const titles = (titlesByPlace[place] || []).filter((t) => isUsablePhoto(t, place));
    const needed = titles.slice(0, Math.max(0, TARGET + 8 - keys.length));
    const urlMap = needed.length ? await imageInfoBatch(needed) : {};
    let n = 1;
    let rateHits = 0;
    for (const title of needed) {
      if (keys.length >= TARGET) break;
      const key = `${place}_${String(n).padStart(2, "0")}`;
      n += 1;
      if (keys.includes(key)) continue;
      const dest = path.join(destDir, `${key}.jpg`);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 15000) {
        keys.push(key);
        continue;
      }
      const url = urlMap[title];
      if (!url) {
        console.warn("no url", key, title);
        continue;
      }
      try {
        await saveBuffer(key, url, destDir);
        keys.push(key);
        rateHits = 0;
        await sleep(1200);
      } catch (err) {
        console.warn("fail", key, err.message, title);
        if (String(err.message).includes("429")) {
          rateHits += 1;
          await sleep(12000);
          if (rateHits >= 3) {
            console.warn("stop place after 429", place);
            break;
          }
        } else {
          await sleep(2500);
        }
      }
    }
    albums[place] = keys;
    fs.writeFileSync(INDEX_PATH, JSON.stringify(albums, null, 2));
    console.log("album", place, keys.length);
  }
  return albums;
}

const MIN_ALBUM = 10;

function isBasePhoto(title) {
  const t = stripFile(title);
  if (!t) return false;
  if (/\.(svg|pdf|djvu|webm|ogv|stl|wav|ogg|mid|opus|png)$/i.test(t)) return false;
  if (!/\.(jpe?g|tiff?|gif|webp)$/i.test(t)) return false;
  if (/location map|coat of arms|logo|icon|flag of|banner|qr code|diagram|wikidata|svg map|route map|admiralty chart/i.test(t)) {
    return false;
  }
  if (/metro|shanghai|xinzhuang|locomotive|railway halt|df7 |mycokeys|cytospora|disease symptoms|limousines|hanting hotel|american forests|hinterhof|boxerspamphlet|shenzhen|whitebark pine|big mountain resort|toll plaza|expwy|expressway|jingyu|tricycle|三轮|收费站|高速公路/i.test(t)) {
    return false;
  }
  return true;
}

function diskKeysFor(place, destDir, existing) {
  const keys = [...existing];
  for (let i = 1; i <= 40; i += 1) {
    const key = `${place}_${String(i).padStart(2, "0")}`;
    const dest = path.join(destDir, `${key}.jpg`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 15000 && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

function nextSlot(place, keys) {
  let n = 1;
  while (keys.includes(`${place}_${String(n).padStart(2, "0")}`)) n += 1;
  return n;
}

async function geoFiles(lat, lon, radius, limit = 50) {
  const data = await commonsGet({
    action: "query",
    list: "geosearch",
    gscoord: `${lat}|${lon}`,
    gsradius: String(Math.min(radius || 8000, 10000)),
    gsnamespace: "6",
    gslimit: String(limit),
  });
  return (data.query?.geosearch || []).map((row) => stripFile(row.title));
}

async function fileBlobs(titles) {
  const map = {};
  for (let i = 0; i < titles.length; i += 20) {
    const chunk = titles.slice(i, i + 20);
    const data = await commonsGet({
      action: "query",
      titles: chunk.map((t) => `File:${t}`).join("|"),
      prop: "categories|imageinfo",
      cllimit: "30",
      iiprop: "extmetadata",
    });
    for (const page of Object.values(data.query?.pages || {})) {
      const title = stripFile(page.title);
      const cats = (page.categories || []).map((c) => c.title).join(" ");
      const meta = page.imageinfo?.[0]?.extmetadata || {};
      const desc = [meta.ImageDescription?.value, meta.ObjectName?.value, meta.Categories?.value].filter(Boolean).join(" ");
      map[title] = `${title} ${cats} ${desc}`.replace(/<[^>]+>/g, " ");
    }
    await sleep(1200);
  }
  return map;
}

async function collectFillTitles(place, cfg, usedTitles) {
  const found = [];
  const addByTitle = (title) => {
    const t = stripFile(title);
    if (!t || usedTitles.has(t) || found.includes(t) || !isUsablePhoto(t, place)) return;
    usedTitles.add(t);
    found.push(t);
  };
  for (const q of cfg.queries || []) {
    if (found.length >= TARGET) break;
    try {
      (await searchFiles(q, 30)).forEach(addByTitle);
      console.log("  fill q", q, "kept", found.length);
    } catch (err) {
      console.warn("  fill q fail", q, err.message);
    }
    await sleep(SEARCH_SLEEP_MS);
  }
  if (cfg.coord && found.length < TARGET) {
    try {
      const geo = await geoFiles(cfg.coord[0], cfg.coord[1], cfg.geoRadius || 8000);
      console.log("  geo", place, geo.length);
      const candidates = geo.filter((t) => isBasePhoto(t) && !usedTitles.has(t) && !found.includes(t));
      const blobs = await fileBlobs(candidates.slice(0, 40));
      for (const [title, blob] of Object.entries(blobs)) {
        if (found.length >= TARGET) break;
        if (!isBasePhoto(title)) continue;
        const ok = isUsablePhoto(title, place) || (cfg.geoHint && cfg.geoHint.test(blob));
        if (!ok) continue;
        if (place === "shangfang" && /segalen|suzhou|nanchang|pengjiaqiao/i.test(blob)) continue;
        if (place === "jingdong" && /jinhai lake station|金海湖站/i.test(blob)) continue;
        if (!usedTitles.has(title) && !found.includes(title)) {
          usedTitles.add(title);
          found.push(title);
        }
      }
    } catch (err) {
      console.warn("  geo fail", place, err.message);
    }
    await sleep(SEARCH_SLEEP_MS);
  }
  return found;
}

async function downloadKeys(place, keys, titles, destDir) {
  const needed = titles.slice(0, Math.max(0, TARGET + 8 - keys.length));
  const urlMap = needed.length ? await imageInfoBatch(needed) : {};
  let n = nextSlot(place, keys);
  let rateHits = 0;
  for (const title of needed) {
    if (keys.length >= TARGET) break;
    const key = `${place}_${String(n).padStart(2, "0")}`;
    n += 1;
    if (keys.includes(key)) continue;
    const dest = path.join(destDir, `${key}.jpg`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 15000) {
      keys.push(key);
      continue;
    }
    const url = urlMap[title];
    if (!url) {
      console.warn("no url", key, title);
      continue;
    }
    try {
      await saveBuffer(key, url, destDir);
      keys.push(key);
      rateHits = 0;
      await sleep(1200);
    } catch (err) {
      console.warn("fail", key, err.message, title);
      if (String(err.message).includes("429")) {
        rateHits += 1;
        await sleep(12000);
        if (rateHits >= 3) {
          console.warn("stop place after 429", place);
          break;
        }
      } else {
        await sleep(2500);
      }
    }
  }
  return keys;
}

async function fillThinAlbums() {
  const destDir = path.join(__dirname, "../../public/static/photos");
  fs.mkdirSync(destDir, { recursive: true });
  let albums = {};
  try {
    albums = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
  } catch {
    albums = {};
  }
  const titlesByPlace = cleanSaved();
  const usedTitles = knownTitles();
  for (const [place, cfg] of Object.entries(PLACE_ALBUMS)) {
    const seed = albums[place] && albums[place].length ? albums[place] : cfg.existing;
    const keys = diskKeysFor(place, destDir, seed);
    albums[place] = keys;
    if (keys.length >= MIN_ALBUM) continue;
    console.log("\n## fill", place, "have", keys.length);
    let pending = (titlesByPlace[place] || []).filter((t) => isUsablePhoto(t, place));
    if (pending.length < TARGET + 4 - keys.length) {
      const more = await collectFillTitles(place, cfg, usedTitles);
      pending = [...new Set([...pending, ...more])];
      titlesByPlace[place] = pending;
      fs.writeFileSync(TITLES_PATH, JSON.stringify(titlesByPlace, null, 2));
    } else {
      console.log("  use saved titles", pending.length);
    }
    try {
      albums[place] = await downloadKeys(place, keys, pending, destDir);
    } catch (err) {
      console.warn("fill download fail", place, err.message);
      albums[place] = keys;
    }
    fs.writeFileSync(INDEX_PATH, JSON.stringify(albums, null, 2));
    console.log("album", place, albums[place].length);
  }
  return albums;
}

function cleanSaved() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(TITLES_PATH, "utf8"));
  } catch {
    return {};
  }
  const out = {};
  for (const [place, titles] of Object.entries(saved)) {
    out[place] = (titles || []).filter((t) => isUsablePhoto(t, place));
  }
  fs.writeFileSync(TITLES_PATH, JSON.stringify(out, null, 2));
  return out;
}

async function main() {
  cleanSaved();
  const titles = await searchAll();
  await downloadAll(titles);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { searchAll, downloadAll, fillThinAlbums, TARGET, MIN_ALBUM, cleanSaved };
