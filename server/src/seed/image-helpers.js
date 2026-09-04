const fs = require("fs");
const path = require("path");
const config = require("../config");
const { ROUTES, PHOTO, PHOTO_FALLBACK } = require("./routes-data");

const THEMES = {
  长城: { sky: "#8ecae6", hill: "#2d6a4f", accent: "#bc4749", sun: "#ffd166" },
  玩水: { sky: "#90e0ef", hill: "#0077b6", accent: "#00b4d8", sun: "#ffe066" },
  登山: { sky: "#a8dadc", hill: "#1b4332", accent: "#d4a373", sun: "#f4a261" },
  山水: { sky: "#bde0fe", hill: "#40916c", accent: "#52b788", sun: "#ffd166" },
  文化: { sky: "#edc4b3", hill: "#9c6644", accent: "#c1121f", sun: "#f4a261" },
  草原: { sky: "#89c2d9", hill: "#2d6a4f", accent: "#95d5b2", sun: "#ffb703" },
  海滨: { sky: "#48cae4", hill: "#023e8a", accent: "#0077b6", sun: "#ffd166" },
};

function svgCover(route) {
  const t = THEMES[route.category] || THEMES.山水;
  const title = route.title.replace(/&/g, "与");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.sky}"/>
      <stop offset="100%" stop-color="#f7f3eb"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#sky)"/>
  <circle cx="980" cy="140" r="70" fill="${t.sun}" opacity="0.9"/>
  <path d="M0 520 L180 360 L320 500 L480 280 L640 470 L820 300 L1000 480 L1200 340 L1200 800 L0 800 Z" fill="${t.hill}" opacity="0.85"/>
  <path d="M0 620 L220 480 L400 610 L590 430 L780 600 L980 450 L1200 580 L1200 800 L0 800 Z" fill="${t.accent}" opacity="0.35"/>
  <rect x="0" y="620" width="1200" height="180" fill="#1b4332" opacity="0.55"/>
  <text x="60" y="700" font-family="PingFang SC, sans-serif" font-size="28" fill="#d8f3dc">同行者众 · ${route.days}日 · ${route.region}</text>
  <text x="60" y="755" font-family="PingFang SC, sans-serif" font-size="48" font-weight="700" fill="#ffffff">${title}</text>
</svg>`;
}

function writeCovers() {
  const dir = path.join(config.publicDir, "static", "routes");
  fs.mkdirSync(dir, { recursive: true });
  for (const r of ROUTES) {
    fs.writeFileSync(path.join(dir, `${r.code}.svg`), svgCover(r));
  }
}

async function downloadPhotos() {
  const dir = path.join(config.publicDir, "static", "photos");
  fs.mkdirSync(dir, { recursive: true });
  const headers = { "User-Agent": "bj-outdoor-trip/1.0 (local demo; cover images)" };
  for (const [key, url] of Object.entries(PHOTO)) {
    const dest = path.join(dir, `${key}.jpg`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 20000) continue;
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.warn("skip photo", key, res.status);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 20000) {
        console.warn("skip tiny photo", key, buf.length);
        continue;
      }
      fs.writeFileSync(dest, buf);
      console.log("downloaded", key, buf.length);
    } catch (e) {
      console.warn("skip photo", key, e.message);
    }
  }
}

function localPhoto(key, seen = new Set()) {
  if (!key || seen.has(key)) return null;
  seen.add(key);
  const p = path.join(config.publicDir, "static", "photos", `${key}.jpg`);
  if (fs.existsSync(p) && fs.statSync(p).size > 15000) return `/static/photos/${key}.jpg`;
  for (const alt of PHOTO_FALLBACK[key] || []) {
    const hit = localPhoto(alt, seen);
    if (hit) return hit;
  }
  return null;
}

function coverOf(route) {
  return localPhoto(route.coverKey) || `/static/routes/${route.code}.svg`;
}

function galleryOf(route) {
  const used = new Set();
  const out = [];
  for (const k of route.galleryKeys) {
    const url = localPhoto(k);
    if (url && !used.has(url)) {
      used.add(url);
      out.push(url);
    }
  }
  const cover = coverOf(route);
  if (cover && !used.has(cover)) out.unshift(cover);
  return out;
}

module.exports = { writeCovers, downloadPhotos, localPhoto, coverOf, galleryOf, svgCover };
