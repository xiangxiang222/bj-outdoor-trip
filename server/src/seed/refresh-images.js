const { getDb, ensureDirs } = require("../db");
const { ROUTES } = require("./routes-data");
const { writeCovers, downloadPhotos, coverOf, galleryOf } = require("./image-helpers");
const { downloadPlacePhotos } = require("./fetch-place-photos");
const { downloadAll } = require("./fetch-place-albums");
const fs = require("fs");
const path = require("path");

async function main() {
  ensureDirs();
  writeCovers();
  await downloadPlacePhotos();
  if (!process.argv.includes("--skip-albums")) {
    try {
      const titles = JSON.parse(fs.readFileSync(path.join(__dirname, "place-album-titles.json"), "utf8"));
      await downloadAll(titles);
    } catch (err) {
      console.warn("skip album download", err.message);
    }
  }
  await downloadPhotos();
  const db = getDb();
  const upd = db.prepare(
    `UPDATE routes SET title=?, subtitle=?, cover=?, gallery_json=?, description=?, highlights_json=?, itinerary_json=?,
      tags_json=?, fee_include=?, fee_exclude=?, equipment=?, notices=?, meetup_json=? WHERE code=?`
  );
  for (const r of ROUTES) {
    upd.run(
      r.title,
      r.subtitle,
      coverOf(r),
      JSON.stringify(galleryOf(r)),
      r.description,
      JSON.stringify(r.highlights),
      JSON.stringify(r.itinerary),
      JSON.stringify(r.tags),
      r.feeInclude,
      r.feeExclude,
      r.equipment,
      r.notices,
      JSON.stringify(r.meetupPoints),
      r.code
    );
    console.log(r.code, coverOf(r), "gallery", galleryOf(r).length);
  }
  console.log("covers and copy refreshed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
