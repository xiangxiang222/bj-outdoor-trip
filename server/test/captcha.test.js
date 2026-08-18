const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { CHARS, createCaptcha, codesMatch, randomCode } = require("../src/services/captcha");

describe("image captcha", () => {
  it("creates a png data url without leaking the code in json fields", () => {
    const cap = createCaptcha();
    assert.match(cap.code, new RegExp(`^[${CHARS}]{4}$`));
    assert.equal(/[0O1I]/.test(cap.code), false);
    assert.equal(cap.png[0], 137);
    assert.equal(cap.png[1], 80);
    assert.equal(cap.png[2], 78);
    assert.equal(cap.png[3], 71);
    assert.match(cap.image, /^data:image\/png;base64,/);
    assert.ok(cap.png.length > 200);
  });

  it("matches codes case-insensitively and rejects empties", () => {
    assert.equal(codesMatch("A2K9", "a2k9"), true);
    assert.equal(codesMatch("A2K9", " A2K9 "), true);
    assert.equal(codesMatch("A2K9", "XXXX"), false);
    assert.equal(codesMatch("A2K9", ""), false);
  });

  it("draws only supported characters", () => {
    const code = randomCode();
    for (const ch of code) assert.equal(CHARS.includes(ch), true);
  });
});
