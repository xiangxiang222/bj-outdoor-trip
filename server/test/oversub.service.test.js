const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { shuffle } = require("../src/services/oversub");

describe("oversub shuffle", () => {
  it("keeps a copy and can be made deterministic", () => {
    const src = [1, 2, 3, 4];
    const values = [0, 0, 0];
    let i = 0;
    const out = shuffle(src, () => values[i++] ?? 0);
    assert.deepEqual(src, [1, 2, 3, 4]);
    assert.equal(out.length, 4);
    assert.deepEqual(new Set(out), new Set(src));
  });
});
