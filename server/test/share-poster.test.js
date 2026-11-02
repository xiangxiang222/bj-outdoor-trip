const fs = require("fs");
const path = require("path");
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const config = require("../src/config");
const { harness } = require("./http");
const {
  encodeShareScene,
  decodeShareScene,
  shareQuery,
  mpSharePath,
  embedLocalMedia,
  renderPosterSvg,
} = require("../src/services/share-poster");

const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);

function writeCover(name = "wall1.jpg") {
  const dir = path.join(config.publicDir, "static", "photos");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), TINY_JPEG);
}

describe("share poster helpers", () => {
  it("encodes and decodes a compact mini-program scene with ref", () => {
    const scene = encodeShareScene({ id: 99, ref: "BX12", joinCode: "" });
    assert.ok(scene.length <= 32);
    assert.deepEqual(decodeShareScene(scene), { id: "99", ref: "BX12", joinCode: "" });
  });

  it("builds h5 query and mini path with referral code", () => {
    assert.equal(shareQuery({ token: "abc", ref: "BX1" }), "token=abc&ref=BX1");
    assert.equal(mpSharePath({ id: 12, ref: "BX1" }), "/pages/schedule/schedule?id=12&ref=BX1");
  });

  it("embeds a local cover so SVG used as an image can show the photo", () => {
    writeCover();
    const dataUrl = embedLocalMedia("http://140.143.171.77/static/photos/wall1.jpg");
    assert.match(dataUrl, /^data:image\/jpeg;base64,/);
    const svg = renderPosterSvg({ title: "十渡", cover: dataUrl, originPrice: 219, memberPrice: 166, studentPrice: 158 }, "");
    assert.match(svg, /href="data:image\/jpeg;base64,/);
    assert.equal(/href="https?:\/\//.test(svg), false);
  });

  it("skips embed when the cover file is missing", () => {
    assert.equal(embedLocalMedia("/static/photos/missing-cover.jpg"), "");
  });
});

describe("schedule poster covers", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  async function writeImage(rel, format = "jpeg") {
    const file = path.join(config.publicDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await sharp({ create: { width: 800, height: 600, channels: 3, background: "#336699" } })
      .toFormat(format).toFile(file);
    return fs.readFileSync(file);
  }

  it("uses and embeds the same resolved photo as the detail page", async () => {
    const photo = await writeImage("static/photos/resolved-share.jpg");
    seed.db.prepare("UPDATE routes SET cover=? WHERE id=?")
      .run("http://old.example/static/photos/resolved-share.svg", seed.routeId);
    const detail = await agent.get(`/api/schedules/${seed.individualScheduleId}`).expect(200);
    const poster = await agent.get(`/api/schedules/${seed.individualScheduleId}/poster`).expect(200);
    assert.equal(poster.body.data.facts.cover, detail.body.data.route.cover);
    assert.match(poster.body.data.facts.cover, /\/static\/photos\/resolved-share\.jpg$/);
    assert.equal(poster.body.data.facts.coverEmbed, `data:image/jpeg;base64,${photo.toString("base64")}`);
    assert.equal(poster.body.data.shareImage, poster.body.data.facts.cover);
  });

  it("includes the default activity cover when the host did not upload one", async () => {
    const photo = await writeImage("static/activities/guandan.png", "png");
    seed.db.prepare("UPDATE routes SET title='周末掼蛋', cover='', gallery_json='[]' WHERE id=?")
      .run(seed.routeId);
    seed.db.prepare("UPDATE schedules SET channel='activity' WHERE id=?").run(seed.individualScheduleId);
    const detail = await agent.get(`/api/schedules/${seed.individualScheduleId}`).expect(200);
    const poster = await agent.get(`/api/schedules/${seed.individualScheduleId}/poster`).expect(200);
    assert.equal(poster.body.data.facts.cover, detail.body.data.gallery[0]);
    assert.match(poster.body.data.facts.cover, /\/static\/activities\/guandan\.png$/);
    assert.equal(poster.body.data.facts.coverEmbed, `data:image/png;base64,${photo.toString("base64")}`);
  });

  it("uses the trip gallery when there is no route cover", async () => {
    await writeImage("static/photos/gallery-share.jpg");
    seed.db.prepare("UPDATE routes SET cover='', gallery_json=? WHERE id=?")
      .run(JSON.stringify(["/static/photos/gallery-share.jpg"]), seed.routeId);
    const detail = await agent.get(`/api/schedules/${seed.individualScheduleId}`).expect(200);
    const poster = await agent.get(`/api/schedules/${seed.individualScheduleId}/poster`).expect(200);
    assert.equal(poster.body.data.facts.cover, detail.body.data.gallery[0]);
    assert.match(poster.body.data.facts.coverEmbed, /^data:image\/jpeg;base64,/);
  });
});
