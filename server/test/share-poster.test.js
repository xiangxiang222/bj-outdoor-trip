const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { encodeShareScene, decodeShareScene, shareQuery, mpSharePath } = require("../src/services/share-poster");

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
});
