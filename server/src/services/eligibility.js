const { getDb } = require("../db");
const { isStudent } = require("./helpers");
const { flagOn } = require("./offer");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function normalizeSchool(name) {
  return String(name || "").replace(/\s+/g, "").trim();
}

function parseSchools(input) {
  let list = [];
  if (Array.isArray(input)) list = input;
  else if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) list = [];
    else if (trimmed.startsWith("[")) {
      try {
        list = JSON.parse(trimmed);
      } catch {
        list = trimmed.split(/[,，;；\n]+/);
      }
    } else {
      list = trimmed.split(/[,，;；\n]+/);
    }
  }
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const name = String(raw || "").trim().slice(0, 40);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= 20) break;
  }
  return out;
}

function parseEnrollLimit(body) {
  const raw = body && typeof body === "object" ? body : {};
  const schools = parseSchools(raw.schools ?? raw.schools_json ?? raw.allowedSchools);
  const studentOnly = flagOn(raw.studentOnly ?? raw.student_only, false) || schools.length > 0;
  return { studentOnly: !!studentOnly, schools };
}

function enrollLimitOf(schedule) {
  if (!schedule) return { studentOnly: false, schools: [] };
  let schools = [];
  try {
    schools = parseSchools(JSON.parse(schedule.schools_json || "[]"));
  } catch {
    schools = parseSchools(schedule.schools_json || "");
  }
  const studentOnly = flagOn(schedule.student_only, false) || schools.length > 0;
  return { studentOnly, schools };
}

function schoolMatches(userSchool, allowed) {
  const u = normalizeSchool(userSchool);
  if (!u) return false;
  return allowed.some((a) => {
    const n = normalizeSchool(a);
    if (!n) return false;
    return u === n || u.includes(n) || n.includes(u);
  });
}

function limitReason(limit) {
  if (limit.schools.length) return `本团仅限 ${limit.schools.join("、")} 已认证学生报名`;
  if (limit.studentOnly) return "本团仅限已认证学生报名";
  return "";
}

function checkEnrollLimit(user, limit) {
  if (!limit.studentOnly && !limit.schools.length) return { ok: true, reason: "" };
  if (!isStudent(user)) return { ok: false, reason: limitReason(limit) };
  if (limit.schools.length && !schoolMatches(user.school, limit.schools)) {
    return { ok: false, reason: limitReason(limit) };
  }
  return { ok: true, reason: "" };
}

function assertEnrollLimit(user, schedule) {
  const checked = checkEnrollLimit(user, enrollLimitOf(schedule));
  if (!checked.ok) fail(400, checked.reason);
}

function eligibilityView(schedule, user) {
  const limit = enrollLimitOf(schedule);
  const enabled = limit.studentOnly || limit.schools.length > 0;
  const checked = checkEnrollLimit(user, limit);
  return {
    enabled,
    studentOnly: limit.studentOnly,
    schools: limit.schools,
    canEnroll: checked.ok,
    reason: enabled && !checked.ok ? checked.reason : "",
    label: limit.schools.length
      ? limit.schools.length <= 2
        ? `仅限${limit.schools.join("、")}`
        : "仅限指定高校"
      : limit.studentOnly
        ? "仅学生"
        : "",
  };
}

function applyEnrollLimit(id, body) {
  const limit = parseEnrollLimit(body);
  getDb()
    .prepare("UPDATE schedules SET student_only=?, schools_json=? WHERE id=?")
    .run(limit.studentOnly ? 1 : 0, JSON.stringify(limit.schools), id);
  return limit;
}

module.exports = {
  parseSchools,
  parseEnrollLimit,
  enrollLimitOf,
  schoolMatches,
  checkEnrollLimit,
  assertEnrollLimit,
  eligibilityView,
  applyEnrollLimit,
};
