const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { getDb } = require("../db");
const { publicMediaUrl } = require("../services/helpers");

const ROOT = path.resolve(__dirname, "../../..");
const PHOTO_DIR = path.join(ROOT, "server/public/static/photos");
const MP = path.join(ROOT, "miniprogram");
const COVER_DIR = path.join(MP, "images/covers");
const DATA_DIR = path.join(MP, "data");
const PKG_DETAIL_ROOT = "pkg-detail";
const GALLERY_DIR = path.join(MP, PKG_DETAIL_ROOT, "gallery");

const COVER_EDGE_PX = 640;
const COVER_JPEG_QUALITY = 32;
const GALLERY_EDGE_PX = 320;
const GALLERY_JPEG_QUALITY = 18;
const MAX_GALLERY_PER_ROUTE = 10;
const PHOTO_PACKAGE_COUNT = 3;
const PKG_DETAIL_MAX_KB = 2000;

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (err) {
    return fallback;
  }
}

function photoFile(url) {
  const key = String(url || "").match(/\/static\/photos\/([^/?#]+)\.(jpe?g|png)$/i);
  return key ? path.join(PHOTO_DIR, `${key[1]}.jpg`) : "";
}

function compressJpeg(src, dest, edgePx, quality) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const result = spawnSync(
    "sips",
    ["-Z", String(edgePx), "-s", "format", "jpeg", "-s", "formatOptions", String(quality), src, "--out", dest],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `sips failed for ${src}`);
  }
}

function uniquePhotoFiles(row) {
  const seen = new Set();
  const files = [];
  const add = (url) => {
    const file = photoFile(url);
    if (!file || !fs.existsSync(file) || seen.has(file)) return;
    seen.add(file);
    files.push(file);
  };
  add(row.cover);
  parseJson(row.gallery_json, []).forEach(add);
  return files.slice(0, MAX_GALLERY_PER_ROUTE);
}

function staticPhotoSrc(file) {
  return `/static/photos/${path.basename(file)}`;
}

function writePng(filePath, width, height, rgb, glyph) {
  const { deflateSync } = require("zlib");
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
      c ^= buf[i];
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const payload = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(payload));
    return Buffer.concat([len, payload, crc]);
  };
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = [0];
    for (let x = 0; x < width; x += 1) {
      const on = glyph(x, y, width, height);
      row.push(on ? rgb[0] : 255, on ? rgb[1] : 255, on ? rgb[2] : 255);
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
}

function tabGlyph(kind) {
  return (x, y, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    if (kind === "home") {
      const roof = y > 18 && y < 40 && Math.abs(x - cx) < (40 - y) * 1.1;
      const body = x > 28 && x < 53 && y >= 38 && y < 62;
      return roof || body;
    }
    if (kind === "routes") {
      return (y > 22 && y < 30 && x > 20 && x < 61) || (y > 36 && y < 44 && x > 20 && x < 61) || (y > 50 && y < 58 && x > 20 && x < 61);
    }
    if (kind === "chain") {
      const left = (x - 28) ** 2 / 64 + (y - cy) ** 2 / 196 < 1;
      const right = (x - 53) ** 2 / 64 + (y - cy) ** 2 / 196 < 1;
      return left || right;
    }
    return x > 30 && x < 51 && y > 22 && y < 60;
  };
}

function writeModule(filePath, value) {
  fs.writeFileSync(filePath, `module.exports = ${JSON.stringify(value, null, 2)};\n`);
}

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).reduce((sum, name) => {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    return sum + (st.isDirectory() ? dirSize(full) : st.size);
  }, 0);
}

function main() {
  fs.mkdirSync(COVER_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.rmSync(GALLERY_DIR, { recursive: true, force: true });
  fs.mkdirSync(GALLERY_DIR, { recursive: true });
  for (let i = 1; i <= PHOTO_PACKAGE_COUNT; i += 1) {
    fs.rmSync(path.join(MP, `pkg-photos-${i}`), { recursive: true, force: true });
  }

  const db = getDb();
  const rows = db.prepare("SELECT * FROM routes WHERE status='on' ORDER BY days, id").all();
  const lite = [];
  const details = [];
  rows.forEach((row) => {
    const src = photoFile(row.cover);
    if (!fs.existsSync(src)) throw new Error(`missing cover ${row.code} ${src}`);
    compressJpeg(src, path.join(COVER_DIR, `${row.code}.jpg`), COVER_EDGE_PX, COVER_JPEG_QUALITY);
    const tiers = db.prepare("SELECT min_people, price, member_price FROM route_price_tiers WHERE route_id=? ORDER BY min_people").all(row.id);
    const cover = `/images/covers/${row.code}.jpg`;
    const gallery = uniquePhotoFiles(row).map((file, index) => {
      const src = staticPhotoSrc(file);
      const remote = publicMediaUrl(src);
      const origin = /^https:\/\//i.test(remote) ? remote : "";
      if (index === 0) {
        return { thumb: cover, src, origin };
      }
      const name = `${row.code}_${String(index + 1).padStart(2, "0")}.jpg`;
      compressJpeg(file, path.join(GALLERY_DIR, name), GALLERY_EDGE_PX, GALLERY_JPEG_QUALITY);
      return { thumb: `/${PKG_DETAIL_ROOT}/gallery/${name}`, src, origin };
    });
    const summary = {
      id: row.id,
      code: row.code,
      title: row.title,
      subtitle: row.subtitle,
      days: row.days,
      difficulty: row.difficulty,
      category: row.category,
      region: row.region,
      cover,
      fromPrice: tiers[0] && tiers[0].price,
      memberFromPrice: tiers[0] && tiers[0].member_price,
    };
    lite.push(summary);
    details.push({
      ...summary,
      season: row.season,
      tags: parseJson(row.tags_json, []),
      description: row.description,
      highlights: parseJson(row.highlights_json, []),
      itinerary: parseJson(row.itinerary_json, []),
      gallery,
      minGroupSize: row.min_group_size,
      priceTiers: tiers.map((t) => ({ minPeople: t.min_people, price: t.price, memberPrice: t.member_price })),
      schedules: [],
    });
  });
  writeModule(path.join(DATA_DIR, "routes-lite.js"), lite);
  writeModule(path.join(DATA_DIR, "routes-detail.js"), details);
  const off = [107, 112, 92];
  const on = [45, 106, 79];
  [
    ["home", "home"],
    ["routes", "routes"],
    ["chain", "chain"],
    ["mine", "mine"],
  ].forEach(([file, kind]) => {
    writePng(path.join(MP, "images", `${file}.png`), 81, 81, off, tabGlyph(kind));
    writePng(path.join(MP, "images", `${file}-on.png`), 81, 81, on, tabGlyph(kind));
  });
  const coverKb = Math.round(dirSize(COVER_DIR) / 1024);
  const pkgKb = Math.round(dirSize(path.join(MP, PKG_DETAIL_ROOT)) / 1024);
  const counts = details.map((d) => `${d.code}:${d.gallery.length}`).join(" ");
  console.log(`covers ${coverKb}KB pkg-detail ${pkgKb}KB`);
  console.log(counts);
  if (pkgKb > PKG_DETAIL_MAX_KB) {
    throw new Error(`pkg-detail ${pkgKb}KB exceeds ${PKG_DETAIL_MAX_KB}KB`);
  }
}

main();
