const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { ROUTES, MEETUPS, PHOTO, PHOTO_FALLBACK } = require("../src/seed/routes-data");

describe("seed routes data", () => {
  it("contains 30 unique route codes", () => {
    assert.equal(ROUTES.length, 30);
    const codes = ROUTES.map((r) => r.code);
    assert.equal(new Set(codes).size, 30);
    for (let i = 1; i <= 30; i += 1) {
      const code = `R${String(i).padStart(2, "0")}`;
      assert.ok(codes.includes(code), `missing ${code}`);
    }
  });

  it("only uses 1/2/3/5 day products", () => {
    for (const r of ROUTES) {
      assert.ok([1, 2, 3, 5].includes(r.days), `${r.code} days=${r.days}`);
      assert.ok(r.priceTiers.length >= 1);
      assert.ok(r.buses.length >= 1);
      assert.ok(r.coverKey);
      assert.ok(Array.isArray(r.galleryKeys));
      assert.ok(r.minGroupSize >= 1);
    }
  });

  it("uses distinct covers for Mutianyu and Badaling", () => {
    const r01 = ROUTES.find((r) => r.code === "R01");
    const r02 = ROUTES.find((r) => r.code === "R02");
    assert.equal(r01.coverKey, "mutianyuLift");
    assert.equal(r02.coverKey, "juyong");
    assert.notEqual(r01.coverKey, r02.coverKey);
    assert.ok(PHOTO.mutianyuLift);
    assert.ok(PHOTO.juyong);
    assert.notEqual(PHOTO.mutianyuLift, PHOTO.juyong);
  });

  it("gives every Great Wall route a unique cover key", () => {
    const walls = ROUTES.filter((r) => r.category === "长城");
    const keys = walls.map((r) => r.coverKey);
    assert.ok(walls.length >= 6);
    assert.equal(new Set(keys).size, keys.length, String(keys));
    assert.deepEqual(
      walls.map((r) => [r.code, r.coverKey]),
      [
        ["R01", "mutianyuLift"],
        ["R02", "juyong"],
        ["R03", "wall3"],
        ["R04", "gubei"],
        ["R16", "simatai"],
        ["R20", "jinshan"],
        ["R23", "panshan"],
      ]
    );
  });

  it("uses Wutai cover for R29", () => {
    const r29 = ROUTES.find((r) => r.code === "R29");
    assert.equal(r29.coverKey, "wutai");
    assert.ok(r29.galleryKeys.includes("wutai"));
    assert.ok(r29.galleryKeys.includes("yungang"));
    assert.ok(r29.galleryKeys.includes("xuankong1"));
    assert.ok(PHOTO.wutai);
    assert.ok(PHOTO.yungang);
    assert.ok(PHOTO_FALLBACK.wutai.includes("wutaiMount"));
  });

  it("does not use generic Unsplash or Forbidden City photos as covers", () => {
    const generic = new Set([
      "temple",
      "village",
      "lake",
      "canyon",
      "river",
      "grass",
      "grass2",
      "forest",
      "mountain1",
      "mountain2",
      "sea",
      "mist",
      "autumn",
      "night",
      "snow",
    ]);
    for (const r of ROUTES) {
      assert.ok(!generic.has(r.coverKey), `${r.code} coverKey=${r.coverKey}`);
      for (const key of r.galleryKeys) {
        assert.ok(!generic.has(key), `${r.code} gallery has generic ${key}`);
      }
      assert.ok(r.galleryKeys.length >= 1, `${r.code} empty gallery`);
      const scarce = new Set(["R10", "R11", "R14"]);
      if (!scarce.has(r.code)) {
        assert.ok(r.galleryKeys.length >= 10, `${r.code} gallery ${r.galleryKeys.length} < 10`);
      }
      assert.ok(r.highlights.length >= 5, `${r.code} highlights`);
      assert.ok(r.description.length > 120, `${r.code} description too short`);
    }
    assert.equal(ROUTES.find((r) => r.code === "R11").coverKey, "shangfangCave");
    assert.equal(ROUTES.find((r) => r.code === "R22").coverKey, "chengdeResort");
    assert.ok(PHOTO.shangfangCave);
    assert.ok(PHOTO.chengdeResort);
  });

  it("defines four Beijing meetup points", () => {
    assert.equal(MEETUPS.length, 4);
    assert.ok(MEETUPS.some((m) => m.name.includes("东直门")));
  });
});
