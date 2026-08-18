const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const {
  pickTier,
  calcPayable,
  earnPoints,
  buildDemographics,
  scheduleStatus,
  maskName,
} = require("../src/services/biz");
const config = require("../src/config");

const TIERS = [
  { minPeople: 20, price: 179, memberPrice: 165 },
  { minPeople: 10, price: 199, memberPrice: 183 },
  { minPeople: 30, price: 159, memberPrice: 146 },
];

describe("pickTier", () => {
  it("sorts by minPeople and keeps the highest unlocked tier", () => {
    assert.equal(pickTier(TIERS, 9).price, 199);
    assert.equal(pickTier(TIERS, 10).price, 199);
    assert.equal(pickTier(TIERS, 19).price, 199);
    assert.equal(pickTier(TIERS, 20).price, 179);
    assert.equal(pickTier(TIERS, 30).price, 159);
    assert.equal(pickTier(TIERS, 80).price, 159);
  });
});

describe("calcPayable", () => {
  const pointsConfig = config.points;

  it("uses member price and 100 points = 1 yuan", () => {
    const r = calcPayable({
      basePrice: 199,
      memberPrice: 183,
      isMember: true,
      points: 500,
      pointsConfig,
    });
    assert.equal(r.price, 183);
    assert.equal(r.offsetYuan, 5);
    assert.equal(r.pointsUsed, 500);
    assert.equal(r.payAmount, 178);
  });

  it("caps offset at 20% and leaves at least 1 yuan", () => {
    const r = calcPayable({
      basePrice: 199,
      memberPrice: 183,
      isMember: true,
      points: 100000,
      pointsConfig,
    });
    assert.equal(r.offsetYuan, Math.floor(183 * 0.2));
    assert.equal(r.payAmount, 183 - r.offsetYuan);
    assert.ok(r.payAmount >= 1);
  });

  it("does not use member price for non-members", () => {
    const r = calcPayable({
      basePrice: 199,
      memberPrice: 183,
      isMember: false,
      points: 0,
      pointsConfig,
    });
    assert.equal(r.price, 199);
    assert.equal(r.offsetYuan, 0);
    assert.equal(r.payAmount, 199);
  });

  it("applies optional maxAmount cap", () => {
    const r = calcPayable({
      basePrice: 199,
      memberPrice: 183,
      isMember: false,
      points: 0,
      pointsConfig,
      maxAmount: 50,
    });
    assert.equal(r.payAmount, 50);
  });
});

describe("earnPoints", () => {
  it("gives member 1.2x bonus", () => {
    assert.equal(earnPoints(100, false, config.points), 100);
    assert.equal(earnPoints(100, true, config.points), 120);
  });
});

describe("scheduleStatus", () => {
  it("returns finished / full / confirmed / recruiting", () => {
    const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");
    const tomorrow = dayjs().add(1, "day").format("YYYY-MM-DD");
    assert.equal(scheduleStatus(0, 10, 30, yesterday), "finished");
    assert.equal(scheduleStatus(30, 10, 30, tomorrow), "full");
    assert.equal(scheduleStatus(10, 10, 30, tomorrow), "confirmed");
    assert.equal(scheduleStatus(3, 10, 30, tomorrow), "recruiting");
  });
});

describe("maskName", () => {
  it("masks names of various lengths", () => {
    assert.equal(maskName(""), "*");
    assert.equal(maskName(null), "*");
    assert.equal(maskName("林"), "林");
    assert.equal(maskName("林北"), "林*");
    assert.equal(maskName("林北野"), "林**");
    assert.equal(maskName("欧阳北野"), "欧**");
  });
});

describe("buildDemographics", () => {
  it("aggregates gender, age and hometown from id cards", () => {
    const data = buildDemographics([
      { id_card: "110101199205121219" },
      { idCard: "110101199001011229" },
      { id_card: "130102198805201218" },
    ]);
    assert.equal(data.total, 3);
    const male = data.gender.find((g) => g.name === "男");
    const female = data.gender.find((g) => g.name === "女");
    assert.equal(male.value, 2);
    assert.equal(female.value, 1);
    assert.ok(data.hometown.some((h) => h.name.includes("北京")));
    assert.ok(data.age.some((a) => a.value > 0));
  });

  it("falls back to birthday when id card is invalid", () => {
    const year = new Date().getFullYear() - 10;
    const data = buildDemographics([{ id_card: "bad", birthday: `${year}-01-01`, gender: "female", hometown: "天津市" }]);
    assert.equal(data.total, 1);
    assert.equal(data.gender.find((g) => g.name === "女").value, 1);
    assert.equal(data.age.find((a) => a.name.includes("儿童")).value, 1);
    assert.equal(data.hometown[0].name, "天津市");
  });

  it("uses parsed age bucket when age is not numeric", () => {
    const data = buildDemographics([{ id_card: "110101199205121219", age: "unknown" }]);
    assert.ok(data.age.some((a) => a.value === 1));
  });

  it("counts unknown gender for empty list fields", () => {
    const data = buildDemographics([{}]);
    assert.equal(data.gender.find((g) => g.name === "未填").value, 1);
  });
});
