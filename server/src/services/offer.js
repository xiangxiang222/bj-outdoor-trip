const config = require("../config");

const OFFER_TYPES = {
  early: { key: "early", label: "早鸟团", color: "#2d6a4f", rate: 0.85 },
  deal: { key: "deal", label: "特惠团", color: "#bc4749", rate: 0.8 },
  free: { key: "free", label: "免费团", color: "#40916c", rate: 0 },
  full: { key: "full", label: "全价团", color: "#1b4332", rate: 1 },
};

function offerMeta(type) {
  return OFFER_TYPES[type] || OFFER_TYPES.full;
}

function liveMemberPrice(origin) {
  return Math.round(Number(origin || 0) * config.member.discountRate);
}

function applyOfferQuote(base, schedule, userIsMember) {
  const origin = Number(base.originPrice || 0);
  const offerType = schedule && schedule.offer_type ? schedule.offer_type : "full";
  const meta = offerMeta(offerType);
  let current = origin;
  const override = schedule && schedule.offer_price;
  if (offerType === "free") {
    current = 0;
  } else if (override != null && override !== "" && Number.isFinite(Number(override))) {
    current = Number(override);
  } else if (meta.rate < 1) {
    current = Math.round(origin * meta.rate);
  }
  if (userIsMember && current > 0) current = liveMemberPrice(current);
  return {
    ...base,
    originPrice: origin,
    memberPrice: liveMemberPrice(origin),
    price: current,
    offerType: meta.key,
    offerLabel: meta.label,
    offerColor: meta.color,
  };
}

module.exports = { OFFER_TYPES, offerMeta, liveMemberPrice, applyOfferQuote };
