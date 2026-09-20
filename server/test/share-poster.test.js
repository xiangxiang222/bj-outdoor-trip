const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const config = require("../src/config");
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
