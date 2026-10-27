const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { absMedia, localCover, withLocalMedia, normalizeLegacyMedia, shareCover } = require("../../miniprogram/utils/media");

describe("mini-program remote media", () => {
  const host = "https://togetherbetter.cn";

  it("loads old package paths from HTTPS while preserving navigation icons", () => {
    assert.equal(absMedia("/images/covers/R01.jpg"), host + "/static/miniprogram/covers/R01.jpg");
    assert.equal(absMedia("/pkg-detail/gallery/R01_02.jpg"), host + "/static/miniprogram/gallery/R01_02.jpg");
    assert.equal(absMedia("/images/logo.jpg"), host + "/static/miniprogram/logo.jpg");
    assert.equal(absMedia("/images/mine-icons/card-dark.png"), host + "/static/miniprogram/account-v2/card-dark.png");
    assert.equal(absMedia("/images/ui/home.png"), "/images/ui/home.png");
    assert.equal(absMedia("/static/uploads/custom.jpg", "http://127.0.0.1:3780"), "http://127.0.0.1:3780/static/uploads/custom.jpg");
    assert.equal(shareCover("/images/covers/R01.jpg"), localCover("R01"));
  });

  it("keeps current route photos and gallery metadata when normalizing older routes", () => {
    const uploaded = { code: "R01", cover: "https://cdn.example/cover.jpg", gallery: ["https://cdn.example/album.jpg"] };
    assert.deepEqual(withLocalMedia(uploaded), uploaded);
    const old = { code: "R01", cover: "/images/covers/R01.jpg", gallery: [{ thumb: "/pkg-detail/gallery/R01_02.jpg", src: "/static/photos/original.jpg", caption: "山野" }] };
    const result = withLocalMedia(old);
    assert.equal(result.gallery[0].thumb, host + "/static/miniprogram/gallery/R01_02.jpg");
    assert.equal(result.gallery[0].src, host + "/static/photos/original.jpg");
    assert.equal(result.gallery[0].caption, "山野");
    assert.equal(old.gallery[0].thumb, "/pkg-detail/gallery/R01_02.jpg");
    assert.equal(withLocalMedia({ code: "R02" }).cover, localCover("R02"));
  });

  it("migrates nested cached responses without changing page links or cached objects", () => {
    const cache = { brand: { slides: [{ url: "/images/covers/R03.jpg" }] }, route: "/pkg-detail/detail/detail?id=3", label: "同行", blank: null };
    const result = normalizeLegacyMedia(cache);
    assert.equal(result.brand.slides[0].url, localCover("R03"));
    assert.equal(result.route, cache.route);
    assert.equal(result.blank, null);
    assert.equal(cache.brand.slides[0].url, "/images/covers/R03.jpg");
  });
});
