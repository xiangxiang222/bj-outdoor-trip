const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { packingList, meetupMapUrl } = require("../src/services/policy");
const { harness } = require("./http");

describe("trip policies", () => {
  it("splits equipment into packing items and builds a map search url", () => {
    assert.deepEqual(packingList("运动鞋、冲锋衣，头灯"), ["运动鞋", "冲锋衣", "头灯"]);
    assert.match(meetupMapUrl("东直门东方银座C口"), /amap\.com/);
  });

  it("exposes cancel policy, waiver and faqs on /meta", async () => {
    const { agent } = harness();
    const res = await agent.get("/api/meta").expect(200);
    assert.ok(res.body.data.waiverText.includes("风险"));
    assert.ok(res.body.data.cancelPolicy.items.length >= 3);
    assert.ok(res.body.data.faqs.some((f) => /紧急联系人/.test(f.q)));
  });
});
