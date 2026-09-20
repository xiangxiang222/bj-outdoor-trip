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

  it("opens Douyin share links in the Douyin app or web player", () => {
    const full = videoPlayerOf("https://www.douyin.com/video/7123456789012345678");
    assert.equal(full.provider, "douyin");
    assert.equal(full.kind, "link");
    assert.equal(full.label, "抖音");
    assert.equal(full.videoId, "7123456789012345678");
    assert.equal(full.watchUrl, "https://www.douyin.com/video/7123456789012345678");
    assert.equal(full.appUrl, "snssdk1128://aweme/detail/7123456789012345678");
    const modal = videoPlayerOf("https://www.douyin.com/user/ms4?modal_id=7123456789012345678");
    assert.equal(modal.videoId, "7123456789012345678");
    const share = videoPlayerOf("https://www.iesdouyin.com/share/video/7123456789012345678/");
    assert.equal(share.provider, "douyin");
    assert.equal(share.videoId, "7123456789012345678");
    const short = videoPlayerOf("https://v.douyin.com/iAbcDefG/");
    assert.equal(short.provider, "douyin");
    assert.equal(short.kind, "link");
    assert.equal(short.videoId, "");
    assert.equal(short.watchUrl, "https://v.douyin.com/iAbcDefG/");
  });

  it("embeds TikTok videos and falls back for short links", () => {
    const full = videoPlayerOf("https://www.tiktok.com/@together/video/7123456789012345678");
    assert.equal(full.provider, "tiktok");
    assert.equal(full.kind, "iframe");
    assert.equal(full.layout, "portrait");
    assert.equal(full.embedUrl, "https://www.tiktok.com/embed/v2/7123456789012345678");
    const short = videoPlayerOf("https://vm.tiktok.com/ZMabcdef/");
    assert.equal(short.provider, "tiktok");
    assert.equal(short.kind, "link");
    assert.equal(short.embedUrl, "");
  });

  it("caps the list and skips duplicates", () => {
    const many = Array.from({ length: 8 }, (_, i) => `https://www.bilibili.com/video/BV1GJ411x7h${i}`);
    many.push(many[0]);
    const views = videoViews(many);
    assert.equal(views.length, 6);
    assert.equal(views[0].kind, "iframe");
  });
});
