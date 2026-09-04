const fs = require("fs");
const path = require("path");
const config = require("../config");

const BUS_PHOTO_BY_ID = {
  coaster10: "/static/buses/coaster10.svg",
  van15: "/static/buses/van15.svg",
  bus30: "/static/buses/bus30.svg",
  bus38: "/static/buses/bus38.svg",
  bus50: "/static/buses/bus50.svg",
};

function busSvg(label, color) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
  <rect width="1200" height="720" fill="#eef6f1"/>
  <rect x="80" y="220" width="980" height="280" rx="48" fill="${color}"/>
  <rect x="140" y="250" width="160" height="110" rx="16" fill="#d8f3dc"/>
  <rect x="330" y="250" width="160" height="110" rx="16" fill="#d8f3dc"/>
  <rect x="520" y="250" width="160" height="110" rx="16" fill="#d8f3dc"/>
  <rect x="710" y="250" width="160" height="110" rx="16" fill="#d8f3dc"/>
  <circle cx="280" cy="520" r="58" fill="#1b4332"/>
  <circle cx="280" cy="520" r="28" fill="#d8d2c2"/>
  <circle cx="880" cy="520" r="58" fill="#1b4332"/>
  <circle cx="880" cy="520" r="28" fill="#d8d2c2"/>
  <text x="120" y="160" font-family="PingFang SC, sans-serif" font-size="36" fill="#1b4332">同行者众用车</text>
  <text x="120" y="480" font-family="PingFang SC, sans-serif" font-size="44" font-weight="700" fill="#fff">${label}</text>
</svg>`;
}

const ART = {
  coaster10: busSvg("10 人考斯特", "#2d6a4f"),
  van15: busSvg("15 人商务车", "#40916c"),
  bus30: busSvg("30 人中巴", "#1b4332"),
  bus38: busSvg("38 人旅游大巴", "#52b788"),
  bus50: busSvg("50 人大型大巴", "#081c15"),
};

function writeBusArt() {
  const dir = path.join(config.publicDir, "static", "buses");
  fs.mkdirSync(dir, { recursive: true });
  for (const [id, svg] of Object.entries(ART)) {
    fs.writeFileSync(path.join(dir, `${id}.svg`), svg);
  }
}

function backfillBusPhotos(db) {
  writeBusArt();
  for (const [id, photo] of Object.entries(BUS_PHOTO_BY_ID)) {
    db.prepare("UPDATE bus_types SET photo=? WHERE id=? AND (photo IS NULL OR photo='')").run(photo, id);
  }
}

module.exports = { BUS_PHOTO_BY_ID, writeBusArt, backfillBusPhotos };
