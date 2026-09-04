const config = require("../config");

const OFFER_TYPES = {
  early: { key: "early", label: "早鸟团", color: "#2d6a4f", rate: 0.85 },
  deal: { key: "deal", label: "特惠团", color: "#bc4749", rate: 0.8 },
  free: { key: "free", label: "免费团", color: "#40916c", rate: 0 },
  family: { key: "family", label: "全家团", color: "#c77d3a", rate: 0.9 },
  combo: { key: "combo", label: "组合团", color: "#7b2d8e", rate: 1 },
  full: { key: "full", label: "全价团", color: "#1b4332", rate: 1 },
};

function offerMeta(type) {
  return OFFER_TYPES[type] || OFFER_TYPES.full;
}

function flagOn(v, fallback = true) {
  if (v === false || v === 0 || v === "0" || v === "off") return false;
  if (v === true || v === 1 || v === "1" || v === "on") return true;
  return fallback;
}

function liveMemberPrice(origin) {
  return Math.round(Number(origin || 0) * config.member.discountRate);
}

function liveStudentPrice(origin) {
  return Math.round(Number(origin || 0) * config.student.discountRate);
}

function applyOfferQuote(base, schedule, userIsMember, userIsStudent) {
  const origin = Number(base.originPrice || 0);
  const offerType = schedule && schedule.offer_type ? schedule.offer_type : "full";
  const meta = offerMeta(offerType);
  let tripPrice = origin;
  const override = schedule && schedule.offer_price;
  if (offerType === "free") {
    tripPrice = 0;
  } else if (override != null && override !== "" && Number.isFinite(Number(override))) {
    tripPrice = Number(override);
  } else if (meta.rate < 1) {
    tripPrice = Math.round(origin * meta.rate);
  }
  const memberOn = flagOn(schedule && schedule.member_price_on);
  const studentOn = flagOn(schedule && schedule.student_price_on);
  const memberPrice = memberOn && tripPrice > 0 ? liveMemberPrice(tripPrice) : tripPrice;
  const studentPrice = studentOn && tripPrice > 0 ? liveStudentPrice(tripPrice) : tripPrice;
  let price = tripPrice;
  if (userIsMember && memberOn && tripPrice > 0) price = memberPrice;
  if (userIsStudent && studentOn && tripPrice > 0) {
    price = userIsMember && memberOn ? Math.min(price, studentPrice) : studentPrice;
  }
  return {
    ...base,
    originPrice: origin,
    memberPrice,
    studentPrice,
    tripPrice,
    price,
    memberPriceOn: memberOn,
    studentPriceOn: studentOn,
    offerType: meta.key,
    offerLabel: meta.label,
    offerColor: meta.color,
  };
}

module.exports = { OFFER_TYPES, offerMeta, flagOn, liveMemberPrice, liveStudentPrice, applyOfferQuote };
