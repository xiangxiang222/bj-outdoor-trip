const { getDb } = require("../db");
const { isStudent, isAlumni } = require("./helpers");
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
  const alumniOk = flagOn(raw.alumniOk ?? raw.alumni_ok, false);
  const oversub = flagOn(raw.oversub, false);
  const studentOnly = flagOn(raw.studentOnly ?? raw.student_only, false) || schools.length > 0 || alumniOk;
  return { studentOnly: !!studentOnly, schools, alumniOk: !!alumniOk, oversub: !!oversub };
}

function enrollLimitOf(schedule) {
  if (!schedule) return { studentOnly: false, schools: [], alumniOk: false, oversub: false };
  let schools = [];
  try {
    schools = parseSchools(JSON.parse(schedule.schools_json || "[]"));
  } catch {
    schools = parseSchools(schedule.schools_json || "");
  }
  const alumniOk = flagOn(schedule.alumni_ok, false);
  const oversub = flagOn(schedule.oversub, false);
  const studentOnly = flagOn(schedule.student_only, false) || schools.length > 0 || alumniOk;
  return { studentOnly, schools, alumniOk, oversub };
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

function campusWho(limit) {
  return limit.alumniOk ? "师生或校友" : "学生";
}

function limitReason(limit) {
  if (limit.schools.length) return `本团仅限 ${limit.schools.join("、")} 已认证${campusWho(limit)}报名`;
  if (limit.studentOnly) return `本团仅限已认证${campusWho(limit)}报名`;
  return "";
}

function campusOk(user, limit) {
  if (isStudent(user)) return true;
  return !!(limit.alumniOk && isAlumni(user));
}

function checkEnrollLimit(user, limit) {
  if (!limit.studentOnly && !limit.schools.length && !limit.alumniOk) return { ok: true, reason: "" };
  if (!campusOk(user, limit)) return { ok: false, reason: limitReason(limit) };
  if (limit.schools.length && !schoolMatches(user.school, limit.schools)) {
    return { ok: false, reason: limitReason(limit) };
  }
  return { ok: true, reason: "" };
}

function assertEnrollLimit(user, schedule) {
  const checked = checkEnrollLimit(user, enrollLimitOf(schedule));
  if (!checked.ok) fail(400, checked.reason);
}

function eligibilityLabel(limit) {
  const who = limit.alumniOk ? "师生校友" : "";
  if (limit.schools.length) {
    if (limit.schools.length <= 2) {
      return `仅限${limit.schools.join("、")}${who}`;
    }
    return limit.alumniOk ? "指定高校师生校友" : "仅限指定高校";
  }
  if (limit.studentOnly) return limit.alumniOk ? "师生校友" : "仅学生";
  return "";
}

function eligibilityView(schedule, user) {
  const limit = enrollLimitOf(schedule);
  const enabled = limit.studentOnly || limit.schools.length > 0 || limit.alumniOk;
  const checked = checkEnrollLimit(user, limit);
  return {
    enabled,
    studentOnly: limit.studentOnly,
    alumniOk: limit.alumniOk,
    schools: limit.schools,
    canEnroll: checked.ok,
    reason: enabled && !checked.ok ? checked.reason : "",
    label: eligibilityLabel(limit),
  };
}

function applyEnrollLimit(id, body) {
  const limit = parseEnrollLimit(body);
  getDb()
    .prepare("UPDATE schedules SET student_only=?, schools_json=?, alumni_ok=?, oversub=? WHERE id=?")
    .run(limit.studentOnly ? 1 : 0, JSON.stringify(limit.schools), limit.alumniOk ? 1 : 0, limit.oversub ? 1 : 0, id);
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
