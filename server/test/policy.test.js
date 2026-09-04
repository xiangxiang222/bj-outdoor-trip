const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { packingList, meetupMapUrl, meetupMap, contacts } = require("../src/services/policy");
const { harness } = require("./http");

describe("trip policies", () => {
  it("splits equipment into packing items and builds a map search url", () => {
    assert.deepEqual(packingList("运动鞋、冲锋衣，头灯"), ["运动鞋", "冲锋衣", "头灯"]);
    assert.match(meetupMapUrl("东直门东方银座C口"), /amap\.com/);
    const pin = meetupMap("东直门东方银座C口");
    assert.equal(pin.precise, true);
    assert.ok(pin.lat && pin.lng);
    assert.match(pin.url, /marker/);
    assert.equal(contacts.officialWechat, "同行者众");
  });

  it("exposes cancel policy, waiver and faqs on /meta", async () => {
    const { agent } = harness();
    const res = await agent.get("/api/meta").expect(200);
    assert.ok(res.body.data.waiverText.includes("风险"));
    assert.ok(res.body.data.cancelPolicy.items.length >= 3);
    assert.ok(res.body.data.faqs.some((f) => /紧急联系人/.test(f.q)));
  });
});
