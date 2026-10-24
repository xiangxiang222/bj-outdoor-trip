const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { groupsFromTargets, normalize, caps } = require("../src/services/gender-ratio");

describe("gender ratio", () => {
  it("splits seats by the ratio and gives the remainder to the larger side", () => {
    assert.deepEqual(caps(30, 1, 1), { male: 15, female: 15 });
    assert.deepEqual(caps(30, 2, 1), { male: 20, female: 10 });
    assert.deepEqual(caps(31, 1, 1), { male: 15, female: 16 });
    assert.deepEqual(caps(10, 0, 1), { male: 0, female: 10 });
    assert.deepEqual(caps(30, 50, 50), { male: 15, female: 15 });
    assert.deepEqual(caps(30, 100, 0), { male: 30, female: 0 });
  });

  it("offers school rows only for two or more schools, and college rows only when a school has two colleges", () => {
    const groups = groupsFromTargets([
      { school: "北京大学", college: "信息学院" },
      { school: "北京大学", college: "光华管理学院" },
      { school: "清华大学", college: "计算机系" },
    ]);
    assert.deepEqual(groups.schools, ["北京大学", "清华大学"]);
    assert.deepEqual(groups.colleges, [
      { school: "北京大学", college: "信息学院" },
      { school: "北京大学", college: "光华管理学院" },
    ]);
  });

  it("uses a school ratio instead of the whole trip, even for one school", () => {
    const rule = normalize(
      {
        on: true,
        overall: { male: 1, female: 1 },
        schools: [{ school: "北京大学", male: 0, female: 1 }],
      },
      [{ school: "北京大学", college: "" }]
    );
    assert.equal(rule.on, true);
    assert.equal(rule.overall, null);
    assert.deepEqual(rule.schools, [{ school: "北京大学", male: 0, female: 1 }]);
    assert.equal(rule.label, "男女比例 北京大学 0:1");
  });

  it("ignores college ratios and keeps the whole-trip ratio", () => {
    const rule = normalize(
      {
        on: true,
        overall: { male: 1, female: 2 },
        colleges: [
          { school: "北京大学", college: "信息学院", male: 1, female: 1 },
          { school: "北京大学", college: "不存在", male: 1, female: 1 },
        ],
      },
      [
        { school: "北京大学", college: "信息学院" },
        { school: "北京大学", college: "光华管理学院" },
      ]
    );
    assert.deepEqual(rule.colleges, []);
    assert.deepEqual(rule.overall, { male: 1, female: 2 });
    assert.equal(rule.label, "男女比例 全团 1:2");
  });
});
