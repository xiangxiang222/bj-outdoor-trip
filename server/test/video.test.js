const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseVideoInput, videoPlayerOf, videoViews } = require("../src/services/video");

describe("route video links", () => {
  it("keeps http urls and drops scripts", () => {
    assert.deepEqual(
      parseVideoInput("https://www.bilibili.com/video/BV1GJ411x7h7\njavascript:alert(1)\nnot-a-url"),
      ["https://www.bilibili.com/video/BV1GJ411x7h7"]
    );
  });

  it("embeds a Bilibili BV share link", () => {
    const v = videoPlayerOf("https://www.bilibili.com/video/BV1GJ411x7h7?p=2&spm_id_from=333");
    assert.equal(v.provider, "bilibili");
    assert.equal(v.kind, "iframe");
    assert.match(v.embedUrl, /bvid=BV1GJ411x7h7/);
    assert.match(v.embedUrl, /page=2/);
    assert.match(v.embedUrl, /player\.bilibili\.com/);
  });

  it("embeds a Bilibili av link", () => {
    const v = videoPlayerOf("https://www.bilibili.com/video/av170001");
    assert.equal(v.kind, "iframe");
    assert.match(v.embedUrl, /aid=170001/);
  });

  it("falls back to an open link for b23 short urls", () => {
    const v = videoPlayerOf("https://b23.tv/abcdef");
    assert.equal(v.provider, "bilibili");
    assert.equal(v.kind, "link");
    assert.equal(v.embedUrl, "");
  });

  it("embeds youtube and plays a direct mp4", () => {
    const yt = videoPlayerOf("https://youtu.be/dQw4w9wgGcQ");
    assert.equal(yt.kind, "iframe");
    assert.match(yt.embedUrl, /youtube-nocookie\.com\/embed\/dQw4w9wgGcQ/);
    const file = videoPlayerOf("https://cdn.example.com/clip.mp4");
    assert.equal(file.kind, "video");
    assert.equal(file.embedUrl, "https://cdn.example.com/clip.mp4");
  });

  it("caps the list and skips duplicates", () => {
    const many = Array.from({ length: 8 }, (_, i) => `https://www.bilibili.com/video/BV1GJ411x7h${i}`);
    many.push(many[0]);
    const views = videoViews(many);
    assert.equal(views.length, 6);
    assert.equal(views[0].kind, "iframe");
  });
});
