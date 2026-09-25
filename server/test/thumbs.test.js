const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const sharp = require("sharp");
const config = require("../src/config");
const { createApp } = require("../src/app");
const { thumbPublicPath } = require("../src/services/thumbs");

describe("cover thumbs", () => {
  it("rewrites local photos to a small jpeg path", () => {
    assert.equal(thumbPublicPath("/static/photos/mutianyu.jpg", 360), "/static/thumbs/360/photos/mutianyu.jpg");
    assert.equal(
      thumbPublicPath("https://togetherbetter.cn/static/uploads/a.png", 960),
      "https://togetherbetter.cn/static/thumbs/960/uploads/a.jpg"
    );
    assert.equal(thumbPublicPath("/static/routes/R01.svg", 360), "/static/routes/R01.svg");
  });

  it("shrinks a photo on first request and caches it", async () => {
    const src = path.join(config.publicDir, "static", "photos", "thumb-sample.jpg");
    fs.mkdirSync(path.dirname(src), { recursive: true });
    await sharp({ create: { width: 800, height: 600, channels: 3, background: "#336699" } }).jpeg().toFile(src);
    const app = createApp();
    const res = await request(app).get("/static/thumbs/360/photos/thumb-sample.jpg");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /image\/jpeg/);
    assert.ok(res.body.length < 20000);
    assert.equal(res.headers["cache-control"], "public, max-age=604800");
    const dest = path.join(config.publicDir, "static", "thumbs", "360", "photos", "thumb-sample.jpg");
    assert.equal(fs.existsSync(dest), true);
  });
});
