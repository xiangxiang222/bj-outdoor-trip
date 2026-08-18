const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { svgCover, writeCovers, localPhoto, coverOf, galleryOf, downloadPhotos } = require("../src/seed/image-helpers");
const { ROUTES } = require("../src/seed/routes-data");
const config = require("../src/config");

describe("image helpers", () => {
  it("renders svg cover with title and days", () => {
    const svg = svgCover({ title: "慕田峪 & 测试", days: 1, region: "怀柔", category: "长城", code: "R01" });
    assert.match(svg, /慕田峪 与 测试/);
    assert.match(svg, /1日/);
    assert.match(svg, /怀柔/);
    const fallback = svgCover({ title: "未知类", days: 2, region: "京郊", category: "不存在", code: "R00" });
    assert.match(fallback, /未知类/);
  });

  it("writes svg files for all seed routes", () => {
    writeCovers();
    const sample = path.join(config.publicDir, "static", "routes", "R01.svg");
    assert.equal(fs.existsSync(sample), true);
    assert.ok(fs.statSync(sample).size > 100);
  });

  it("falls back to svg when photos are missing", () => {
    assert.equal(localPhoto("not-a-key"), null);
    const r01 = ROUTES.find((r) => r.code === "R01");
    assert.equal(coverOf(r01), `/static/routes/${r01.code}.svg`);
    const gallery = galleryOf(r01);
    assert.ok(Array.isArray(gallery));
  });

  it("uses local jpg for cover and gallery", () => {
    const dir = path.join(config.publicDir, "static", "photos");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "mutianyuLift.jpg"), Buffer.alloc(25001, 7));
    fs.writeFileSync(path.join(dir, "wall2.jpg"), Buffer.alloc(25001, 8));
    const r01 = ROUTES.find((r) => r.code === "R01");
    assert.equal(coverOf(r01), "/static/photos/mutianyuLift.jpg");
    const gallery = galleryOf(r01);
    assert.ok(gallery.includes("/static/photos/mutianyuLift.jpg"));
  });

  it("downloadPhotos skips failed and tiny responses", async () => {
    const orig = global.fetch;
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 404 };
      if (calls === 2) return { ok: true, arrayBuffer: async () => Buffer.from("tiny") };
      throw new Error("network down");
    };
    try {
      await downloadPhotos();
      assert.ok(calls >= 3);
    } finally {
      global.fetch = orig;
    }
  });

  it("downloadPhotos writes large jpeg files", async () => {
    const orig = global.fetch;
    global.fetch = async () => ({
      ok: true,
      arrayBuffer: async () => Buffer.alloc(25000, 9),
    });
    try {
      await downloadPhotos();
      const dest = path.join(config.publicDir, "static", "photos", "mountain1.jpg");
      assert.equal(fs.existsSync(dest), true);
      assert.ok(fs.statSync(dest).size >= 20000);
    } finally {
      global.fetch = orig;
    }
  });
});
