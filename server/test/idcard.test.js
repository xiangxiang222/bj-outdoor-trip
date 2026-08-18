const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseIdCard, maskIdCard, ageBucketOf, AGE_BUCKETS, PROVINCES, makeIdCard } = require("../src/services/idcard");

describe("parseIdCard", () => {
  it("rejects empty and short values", () => {
    assert.equal(parseIdCard().valid, false);
    assert.equal(parseIdCard("").valid, false);
    assert.equal(parseIdCard("123").valid, false);
    assert.equal(parseIdCard("11010119920512121").valid, false);
    assert.match(parseIdCard("110101199205121").error, /18位/);
  });

  it("rejects 15-digit legacy numbers", () => {
    const p = parseIdCard("110101920512121");
    assert.equal(p.valid, false);
    assert.match(p.error, /15位/);
  });

  it("rejects invalid birthday and checksum", () => {
    assert.equal(parseIdCard("110101199002301219").valid, false);
    assert.match(parseIdCard("110101199002301219").error, /出生日期/);
    const bad = parseIdCard("11010119920512121X");
    assert.equal(bad.valid, false);
    assert.match(bad.error, /校验码/);
  });

  it("parses Beijing male card", () => {
    const p = parseIdCard("110101199205121219");
    assert.equal(p.valid, true);
    assert.equal(p.gender, "male");
    assert.equal(p.province, "北京市");
    assert.equal(p.hometown, "北京市");
    assert.equal(p.birthday, "1992-05-12");
    assert.equal(p.regionCode, "110101");
    assert.match(p.ageBucket, /^\d/);
  });

  it("parses female card and Hebei hometown", () => {
    const f = parseIdCard("110101199001011229");
    assert.equal(f.valid, true);
    assert.equal(f.gender, "female");
    const h = parseIdCard("130102198805201218");
    assert.equal(h.valid, true);
    assert.equal(h.province, "河北省");
    assert.equal(h.city, "石家庄市");
    assert.equal(h.hometown, "河北省石家庄市");
  });

  it("accepts lowercase x and spaces", () => {
    const id = makeIdCard("110101", "19900307", "1", "89");
    const p = parseIdCard(` ${id.toLowerCase()} `);
    assert.equal(p.valid, true);
    assert.equal(p.idCard, id);
  });

  it("falls back to unknown province", () => {
    const p = parseIdCard(makeIdCard("990101", "19900101", "1"));
    assert.equal(p.valid, true);
    assert.equal(p.province, "未知");
  });
});

describe("maskIdCard", () => {
  it("masks middle digits", () => {
    assert.equal(maskIdCard("110101199205121219"), "110101********1219");
  });

  it("returns short or empty as-is", () => {
    assert.equal(maskIdCard(""), "");
    assert.equal(maskIdCard("123"), "123");
    assert.equal(maskIdCard(null), "");
  });
});

describe("ageBucketOf", () => {
  it("covers every defined bucket and overflow", () => {
    assert.equal(ageBucketOf(0).key, "0-12");
    assert.equal(ageBucketOf(12).key, "0-12");
    assert.equal(ageBucketOf(13).key, "13-17");
    assert.equal(ageBucketOf(25).key, "18-25");
    assert.equal(ageBucketOf(35).key, "26-35");
    assert.equal(ageBucketOf(45).key, "36-45");
    assert.equal(ageBucketOf(55).key, "46-55");
    assert.equal(ageBucketOf(65).key, "56-65");
    assert.equal(ageBucketOf(80).key, "66+");
    assert.equal(ageBucketOf(-1).key, "66+");
    assert.equal(AGE_BUCKETS.length, 8);
    assert.equal(PROVINCES["11"], "北京市");
  });
});
