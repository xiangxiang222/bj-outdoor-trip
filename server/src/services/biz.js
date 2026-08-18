const dayjs = require("dayjs");
const { parseIdCard, ageBucketOf, AGE_BUCKETS } = require("./idcard");

function pickTier(tiers, peopleCount) {
  const sorted = [...tiers].sort((a, b) => a.minPeople - b.minPeople);
  let matched = sorted[0];
  for (const tier of sorted) {
    if (peopleCount >= tier.minPeople) matched = tier;
  }
  return matched;
}

function calcPayable({ basePrice, memberPrice, isMember, points, pointsConfig, maxAmount }) {
  const price = isMember && memberPrice ? memberPrice : basePrice;
  const maxOffset = Math.floor(price * pointsConfig.maxOffsetRatio);
  const byPoints = Math.floor((points || 0) / pointsConfig.redeemRate);
  const offsetYuan = Math.min(maxOffset, byPoints, price - 1);
  const pointsUsed = offsetYuan * pointsConfig.redeemRate;
  const payAmount = Math.max(0, price - offsetYuan);
  if (maxAmount != null) {
    return { price, offsetYuan, pointsUsed, payAmount: Math.min(payAmount, maxAmount) };
  }
  return { price, offsetYuan, pointsUsed, payAmount };
}

function earnPoints(payAmount, isMember, config) {
  const rate = isMember ? config.earnRate * require("../config").member.pointsBonus : config.earnRate;
  return Math.floor(payAmount * rate);
}

function buildDemographics(enrollments) {
  const gender = { male: 0, female: 0, unknown: 0 };
  const ageMap = Object.fromEntries(AGE_BUCKETS.map((b) => [b.key, 0]));
  const hometownMap = {};
  for (const row of enrollments) {
    const idCard = row.idCard || row.id_card;
    const parsed = parseIdCard(idCard);
    let g = row.gender;
    let age = row.age;
    let hometown = row.hometown;
    if (parsed.valid) {
      g = g || parsed.gender;
      age = age || parsed.age;
      hometown = hometown || parsed.hometown;
    } else if (row.birthday) {
      const y = Number(String(row.birthday).slice(0, 4));
      if (y) age = new Date().getFullYear() - y;
    }
    if (g === "male") gender.male += 1;
    else if (g === "female") gender.female += 1;
    else gender.unknown += 1;

    if (typeof age === "number") {
      const bucket = ageBucketOf(age);
      ageMap[bucket.key] += 1;
    } else if (parsed.valid) {
      ageMap[parsed.ageBucket] += 1;
    }
    const key = hometown || (parsed.valid ? parsed.hometown : "未填写");
    hometownMap[key] = (hometownMap[key] || 0) + 1;
  }
  return {
    total: enrollments.length,
    gender: [
      { name: "男", value: gender.male },
      { name: "女", value: gender.female },
      { name: "未填", value: gender.unknown },
    ].filter((x) => x.value > 0 || enrollments.length === 0),
    age: AGE_BUCKETS.map((b) => ({ name: b.label, value: ageMap[b.key] || 0 })),
    hometown: Object.entries(hometownMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12),
  };
}

function scheduleStatus(enrolled, minGroup, maxSeats, date, now = dayjs()) {
  if (dayjs(date).isBefore(now, "day")) return "finished";
  if (enrolled >= maxSeats) return "full";
  if (enrolled >= minGroup) return "confirmed";
  return "recruiting";
}

function maskName(name) {
  if (!name) return "*";
  if (name.length === 1) return name;
  return name[0] + "*".repeat(Math.min(2, name.length - 1));
}

module.exports = {
  pickTier,
  calcPayable,
  earnPoints,
  buildDemographics,
  scheduleStatus,
  maskName,
};
