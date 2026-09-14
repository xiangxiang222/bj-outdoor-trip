const crypto = require("crypto");
const { getDb } = require("../db");

const PRIVATE_LABEL = "加密团";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizeJoinCode(raw) {
  return String(raw || "").trim().replace(/\s+/g, "");
}

function randomJoinCode(len = 6) {
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)];
  }
  return out;
}

function fail(message) {
  const err = new Error(message);
  err.status = 400;
  throw err;
}

function flaggedPrivate(body = {}) {
  return [body.privateJoin, body.private_join, body.encrypted, body.private].some(
    (v) => v === true || v === 1 || v === "true" || v === "1" || v === "on"
  );
}

function resolveJoinCode(body = {}) {
  const typed = normalizeJoinCode(body.joinCode || body.join_code);
  if (!flaggedPrivate(body) && !typed) return "";
  const code = typed || randomJoinCode();
  if (code.length < 4 || code.length > 16) fail("入团口令需要 4～16 个字");
  return code;
}

function joinCodesMatch(stored, given) {
  return normalizeJoinCode(stored).toLowerCase() === normalizeJoinCode(given).toLowerCase();
}

function canRevealJoinCode(sch, req = {}) {
  if (!normalizeJoinCode(sch && sch.join_code)) return false;
  if (req.adminId) return true;
  if (req.userId && sch.organizer_id && Number(req.userId) === Number(sch.organizer_id)) return true;
  if (req.guideId && sch.guide_id && Number(req.guideId) === Number(sch.guide_id)) return true;
  if (req.userId && sch.id) {
    const mine = getDb()
      .prepare(
        "SELECT id FROM enrollments WHERE schedule_id=? AND user_id=? AND status IN ('joined','waitlist','applied') LIMIT 1"
      )
      .get(sch.id, req.userId);
    if (mine) return true;
  }
  return false;
}

function joinLockView(sch, req) {
  const code = normalizeJoinCode(sch && sch.join_code);
  if (!code) return { private: false, privateLabel: "", joinCodeRequired: false };
  const view = { private: true, privateLabel: PRIVATE_LABEL, joinCodeRequired: true };
  if (canRevealJoinCode(sch, req)) view.joinCode = code;
  return view;
}

function assertJoinCode(sch, given, user) {
  const stored = normalizeJoinCode(sch && sch.join_code);
  if (!stored) return;
  if (user && sch.organizer_id && Number(user.id) === Number(sch.organizer_id)) return;
  if (!joinCodesMatch(stored, given)) fail("这是加密团，请填写正确的入团口令");
}

module.exports = {
  PRIVATE_LABEL,
  normalizeJoinCode,
  randomJoinCode,
  resolveJoinCode,
  joinCodesMatch,
  canRevealJoinCode,
  joinLockView,
  assertJoinCode,
};
