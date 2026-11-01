const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const review = require("../../miniprogram/content/legal-review.json");
const webReview = require("../../web/src/data/legal-review.json");
const legal = require("../src/services/legal");
const validators = require("../../miniprogram/utils/legal");

function pageWith(request, doc = "") {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../miniprogram/pages/legal/legal.js"), "utf8"), {
    Page(value) { definition = value; },
    wx: { setNavigationBarTitle() {} },
    require(id) {
      if (id.endsWith("/request")) return { request };
      if (id.endsWith("/legal")) return validators;
      if (id.endsWith("legal-review.json")) return review;
      throw new Error(id);
    },
  });
  return { ...definition, data: { ...definition.data, docId: doc }, setData(patch) { Object.assign(this.data, patch); } };
}

describe("native legal reader with an older deployed server", () => {
  it("ships identical client review copies from the authoritative draft, independent of publication settings", () => {
    const draft = legal.legalBundle({});
    assert.equal(draft.status, "draft");
    assert.equal(draft.effectiveAt, null);
    assert.deepEqual(review, webReview);
    assert.deepEqual(review.documents, draft.documents);
    assert.equal(review.status, "draft");
    assert.equal(review.effectiveAt, null);
    assert.equal(review.reviewOnly, true);
    assert.equal(review.operator.email, "");
    assert.equal(review.operator.phone, "");
    assert.throws(() => validators.legalAuthPayload(review, true), /审阅副本/);
  });

  it("keeps all seven full documents readable when the live endpoint is missing", async () => {
    for (const document of review.documents) {
      const page = pageWith(async () => { throw Object.assign(new Error("HTTP 404"), { status: 404 }); }, document.id);
      await page.load();
      assert.equal(page.data.loading, false);
      assert.equal(page.data.error, "");
      assert.equal(page.data.reviewOnly, true);
      assert.equal(page.data.document.id, document.id);
      assert.ok(page.data.document.sections.length > 0);
    }
  });

  it("takes the current server version after retry without retaining the bundled draft", async () => {
    const published = { ...review, reviewOnly: false, status: "published", version: "server-current", effectiveAt: "2026-11-01" };
    let calls = 0;
    const page = pageWith(async () => {
      if (++calls === 1) throw Object.assign(new Error("HTTP 404"), { status: 404 });
      return { data: published };
    }, "privacy");
    await page.load();
    assert.equal(page.data.reviewOnly, true);
    await page.load();
    assert.equal(page.data.reviewOnly, false);
    assert.equal(page.data.bundle.version, "server-current");
    assert.equal(page.data.bundle.status, "published");
    assert.equal(page.data.error, "");
  });

  it("does not conceal outages, permission failures or malformed successful responses", async () => {
    for (const status of [undefined, 401, 403, 500, 503]) {
      const page = pageWith(async () => { throw Object.assign(new Error("unavailable"), { status }); });
      await page.load();
      assert.equal(page.data.bundle, null);
      assert.equal(page.data.error, "unavailable");
      assert.equal(page.data.reviewOnly, false);
      assert.equal(page.data.loading, false);
    }
    const page = pageWith(async () => ({ data: {} }));
    await page.load();
    assert.match(page.data.error, /暂不可用/);
    assert.equal(page.data.bundle, null);
  });
});
