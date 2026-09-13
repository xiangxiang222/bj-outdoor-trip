const { getDb } = require("../db");
const { isStudent, isAlumni } = require("./helpers");
const { flagOn, offerMeta } = require("./offer");

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

function namesFromStored(raw) {
  try {
    return parseSchools(JSON.parse(raw || "[]"));
  } catch {
    return parseSchools(raw || "");
  }
}

function isCampusFreeTrip(body = {}) {
  const organizerType = String(body.organizerType || body.organizer_type || "").toLowerCase();
  const offerType = offerMeta(body.offerType || body.offer_type).key;
  return organizerType === "campus" && offerType === "free";
}

function withCampusFreeDefaults(body = {}) {
  if (!isCampusFreeTrip(body)) return body;
  const next = { ...body, oversub: true, studentOnly: true };
  const schools = parseSchools(next.schools ?? next.schools_json ?? next.allowedSchools);
  if (!schools.length) {
    const name = String(next.companyName || next.company_name || next.campusName || next.campus_name || "").trim();
    if (name) next.schools = name;
  }
  return next;
}

function campusAnchor(body = {}, user = {}) {
  const raw = body && typeof body === "object" ? body : {};
  const school = String(
    raw.campusSchool || raw.campus_school || raw.companyName || raw.company_name || raw.campusName || raw.campus_name || user.school || ""
  ).trim();
  const college = String(raw.campusCollege || raw.campus_college || user.college || "").trim();
  return { school, college };
}

function applyCampusScope(body = {}, user = {}) {
  const raw = body && typeof body === "object" ? body : {};
  const scope = String(raw.campusScope || raw.campus_scope || "").toLowerCase();
  if (!scope || scope === "open") return raw;
  const next = { ...raw, studentOnly: true };
  const { school, college } = campusAnchor(raw, user);
  if (scope === "certified") return next;
  if (scope === "college") {
    if (!school) fail(400, "仅本学院发团请填写学校");
    if (!college) fail(400, "仅本学院发团请填写学院");
    next.schools = [school];
    next.colleges = [college];
    return next;
  }
  if (scope === "school") {
    if (!school) fail(400, "仅本校发团请填写学校");
    next.schools = [school];
    next.colleges = [];
    return next;
  }
  if (scope === "colleges") {
    if (!school) fail(400, "跨学院发团请填写学校");
    let colleges = parseSchools(raw.colleges ?? raw.colleges_json ?? raw.allowedColleges);
    if (college && !schoolMatches(college, colleges)) colleges = parseSchools([college, ...colleges]);
    if (!colleges.length) fail(400, "请填写要开放的学院");
    next.schools = [school];
    next.colleges = colleges;
    return next;
  }
  if (scope === "schools") {
    let schools = parseSchools(raw.schools ?? raw.schools_json ?? raw.allowedSchools);
    if (school && !schoolMatches(school, schools)) schools = parseSchools([school, ...schools]);
    if (!schools.length) fail(400, "请填写要开放的学校");
    next.schools = schools;
    next.colleges = parseSchools(raw.colleges ?? raw.colleges_json ?? raw.allowedColleges);
    return next;
  }
  return next;
}

function parseEnrollLimit(body) {
  const raw = body && typeof body === "object" ? body : {};
  const schools = parseSchools(raw.schools ?? raw.schools_json ?? raw.allowedSchools);
  const colleges = parseSchools(raw.colleges ?? raw.colleges_json ?? raw.allowedColleges);
  const alumniOk = flagOn(raw.alumniOk ?? raw.alumni_ok, false);
  const oversub = flagOn(raw.oversub, false);
  const studentOnly =
    flagOn(raw.studentOnly ?? raw.student_only, false) || schools.length > 0 || colleges.length > 0 || alumniOk;
  return { studentOnly: !!studentOnly, schools, colleges, alumniOk: !!alumniOk, oversub: !!oversub };
}

function resolveEnrollLimit(body, user) {
  const limit = parseEnrollLimit(applyCampusScope(withCampusFreeDefaults(body || {}), user || {}));
  if (limit.colleges.length && !limit.schools.length) fail(400, "限定学院时请同时限定学校");
  return limit;
}

function enrollLimitOf(schedule) {
  if (!schedule) return { studentOnly: false, schools: [], colleges: [], alumniOk: false, oversub: false };
  const schools = namesFromStored(schedule.schools_json);
  const colleges = namesFromStored(schedule.colleges_json);
  const alumniOk = flagOn(schedule.alumni_ok, false);
  const oversub = flagOn(schedule.oversub, false);
  const studentOnly = flagOn(schedule.student_only, false) || schools.length > 0 || colleges.length > 0 || alumniOk;
  return { studentOnly, schools, colleges, alumniOk, oversub };
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

function campusPlace(limit) {
  if (limit.colleges.length && limit.schools.length === 1) {
    return `${limit.schools[0]}${limit.colleges.join("、")}`;
  }
  if (limit.colleges.length && limit.schools.length) {
    return `${limit.schools.join("、")} ${limit.colleges.join("、")}`;
  }
  if (limit.schools.length) return limit.schools.join("、");
  return "";
}

function limitReason(limit) {
  const who = campusWho(limit);
  const place = campusPlace(limit);
  if (place) return `本团仅限 ${place} 已认证${who}报名`;
  if (limit.studentOnly) return `本团仅限已认证${who}报名`;
  return "";
}

function campusOk(user, limit) {
  if (isStudent(user)) return true;
  return !!(limit.alumniOk && isAlumni(user));
}

function isCampusLimited(limit) {
  return !!(limit.studentOnly || limit.schools.length || limit.colleges.length || limit.alumniOk);
}

function checkEnrollLimit(user, limit) {
  if (!isCampusLimited(limit)) return { ok: true, reason: "" };
  if (!campusOk(user, limit)) return { ok: false, reason: limitReason(limit) };
  if (limit.schools.length && !schoolMatches(user.school, limit.schools)) {
    return { ok: false, reason: limitReason(limit) };
  }
  if (limit.colleges.length && !schoolMatches(user.college, limit.colleges)) {
    return { ok: false, reason: limitReason(limit) };
  }
  return { ok: true, reason: "" };
}

function assertEnrollLimit(user, schedule) {
  const checked = checkEnrollLimit(user, enrollLimitOf(schedule));
  if (!checked.ok) fail(400, checked.reason);
}

function campusScopeOf(limit) {
  if (!isCampusLimited(limit)) return "open";
  if (limit.colleges.length && limit.schools.length <= 1) {
    return limit.colleges.length === 1 ? "college" : "colleges";
  }
  if (limit.schools.length > 1) return "schools";
  if (limit.schools.length === 1) return "school";
  return "certified";
}

function eligibilityLabel(limit) {
  const who = limit.alumniOk ? "师生校友" : "";
  const place = campusPlace(limit);
  if (place) {
    if (limit.schools.length <= 2 && limit.colleges.length <= 3) return `仅限${place}${who}`;
    return limit.alumniOk ? "指定高校师生校友" : "仅限指定高校";
  }
  if (limit.studentOnly) return limit.alumniOk ? "师生校友" : "仅学生";
  return "";
}

function eligibilityView(schedule, user) {
  const limit = enrollLimitOf(schedule);
  const enabled = isCampusLimited(limit);
  const checked = checkEnrollLimit(user, limit);
  return {
    enabled,
    studentOnly: limit.studentOnly,
    alumniOk: limit.alumniOk,
    schools: limit.schools,
    colleges: limit.colleges,
    scope: campusScopeOf(limit),
    canEnroll: checked.ok,
    reason: enabled && !checked.ok ? checked.reason : "",
    label: eligibilityLabel(limit),
  };
}

function persistEnrollLimit(id, limit) {
  getDb()
    .prepare("UPDATE schedules SET student_only=?, schools_json=?, colleges_json=?, alumni_ok=?, oversub=? WHERE id=?")
    .run(
      limit.studentOnly ? 1 : 0,
      JSON.stringify(limit.schools),
      JSON.stringify(limit.colleges),
      limit.alumniOk ? 1 : 0,
      limit.oversub ? 1 : 0,
      id
    );
  return limit;
}

function applyEnrollLimit(id, body, user) {
  return persistEnrollLimit(id, resolveEnrollLimit(body, user));
}

function keepNames(current, next) {
  return parseSchools([...current, ...next]);
}

function expandEnrollLimit(schedule, body) {
  const current = enrollLimitOf(schedule);
  if (!isCampusLimited(current)) fail(400, "本团未限定校园范围，无需再开放");
  const raw = body && typeof body === "object" ? body : {};
  const addSchools = parseSchools(raw.addSchools ?? raw.add_schools);
  const addColleges = parseSchools(raw.addColleges ?? raw.add_colleges);
  const openAllColleges = flagOn(raw.openAllColleges ?? raw.open_all_colleges, false);
  const incomingSchools = parseSchools(raw.schools ?? raw.schools_json);
  const incomingColleges = parseSchools(raw.colleges ?? raw.colleges_json);
  if (!addSchools.length && !addColleges.length && !openAllColleges && !incomingSchools.length && !incomingColleges.length) {
    fail(400, "请填写要开放的学院或学校");
  }
  if (!current.schools.length && (addSchools.length || incomingSchools.length)) {
    fail(400, "当前未限定学校，不能再收窄到指定高校");
  }
  if (!current.colleges.length && current.schools.length && (addColleges.length || incomingColleges.length) && !openAllColleges) {
    fail(400, "当前本校各学院均可报名，不能再收窄到指定学院");
  }
  const schools = keepNames(current.schools, [...incomingSchools, ...addSchools, ...current.schools]);
  const colleges = openAllColleges ? [] : keepNames(current.colleges, [...incomingColleges, ...addColleges, ...current.colleges]);
  return persistEnrollLimit(schedule.id, {
    studentOnly: true,
    schools,
    colleges,
    alumniOk: current.alumniOk || flagOn(raw.alumniOk ?? raw.alumni_ok, false),
    oversub: raw.oversub === undefined ? current.oversub : flagOn(raw.oversub, false),
  });
}

module.exports = {
  parseSchools,
  parseEnrollLimit,
  resolveEnrollLimit,
  enrollLimitOf,
  schoolMatches,
  checkEnrollLimit,
  assertEnrollLimit,
  eligibilityView,
  applyEnrollLimit,
  expandEnrollLimit,
  applyCampusScope,
  isCampusFreeTrip,
  withCampusFreeDefaults,
};
