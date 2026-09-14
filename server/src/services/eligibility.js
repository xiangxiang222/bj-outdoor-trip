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

function emptyTarget(school = "", college = "", major = "") {
  return {
    school: String(school || "").trim().slice(0, 40),
    college: String(college || "").trim().slice(0, 40),
    major: String(major || "").trim().slice(0, 40),
  };
}

function parseTarget(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "string") {
    const school = raw.trim().slice(0, 40);
    return school ? emptyTarget(school) : null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const school = String(raw.school || raw.campusSchool || raw.campus_school || "").trim().slice(0, 40);
  if (!school) return null;
  const college = String(raw.college || raw.campusCollege || raw.campus_college || "").trim().slice(0, 40);
  const major = college ? String(raw.major || "").trim().slice(0, 40) : "";
  return emptyTarget(school, college, major);
}

function parseTargets(input) {
  let list = [];
  if (Array.isArray(input)) list = input;
  else if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        list = JSON.parse(trimmed);
      } catch {
        return [];
      }
    }
  } else if (input && typeof input === "object") {
    const nested = input.campusTargets ?? input.targets ?? input.campus_targets;
    if (nested) return parseTargets(nested);
  }
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const t = parseTarget(raw);
    if (!t) continue;
    const key = `${t.school}\0${t.college}\0${t.major}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 40) break;
  }
  return out;
}

function targetsFromSchoolsColleges(schools, colleges) {
  const schoolNames = parseSchools(schools);
  const collegeNames = parseSchools(colleges);
  if (!schoolNames.length) return [];
  if (!collegeNames.length) return schoolNames.map((school) => emptyTarget(school));
  const out = [];
  for (const school of schoolNames) {
    for (const college of collegeNames) {
      out.push(emptyTarget(school, college));
      if (out.length >= 40) return out;
    }
  }
  return out;
}

function derivedSchools(targets) {
  return parseSchools((targets || []).map((t) => t.school));
}

function derivedColleges(targets) {
  return parseSchools((targets || []).filter((t) => t.college).map((t) => t.college));
}

function derivedMajors(targets) {
  return parseSchools((targets || []).filter((t) => t.major).map((t) => t.major));
}

function formatTarget(t) {
  if (!t || !t.school) return "";
  return `${t.school}${t.college || ""}${t.major || ""}`;
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
  const targets = parseTargets(next.campusTargets ?? next.targets ?? next.campus_targets);
  if (!schools.length && !targets.length) {
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
  const major = String(raw.campusMajor || raw.campus_major || user.major || "").trim();
  return { school, college, major };
}

function applyCampusScope(body = {}, user = {}) {
  const raw = body && typeof body === "object" ? body : {};
  const scope = String(raw.campusScope || raw.campus_scope || "").toLowerCase();
  if (!scope) return raw;
  if (scope === "open") {
    return { ...raw, campusTargets: [], schools: [], colleges: [] };
  }
  const next = { ...raw, studentOnly: true };
  const { school, college } = campusAnchor(raw, user);
  if (scope === "certified") {
    next.campusTargets = [];
    next.schools = [];
    next.colleges = [];
    return next;
  }
  if (scope === "college") {
    if (!school) fail(400, "仅本学院发团请填写学校");
    if (!college) fail(400, "仅本学院发团请填写学院");
    const explicitMajor = String(raw.campusMajor || raw.campus_major || "").trim();
    next.campusTargets = [emptyTarget(school, college, explicitMajor)];
    next.schools = [school];
    next.colleges = [college];
    return next;
  }
  if (scope === "school") {
    if (!school) fail(400, "仅本校发团请填写学校");
    next.campusTargets = [emptyTarget(school)];
    next.schools = [school];
    next.colleges = [];
    return next;
  }
  if (scope === "colleges") {
    if (!school) fail(400, "跨学院发团请填写学校");
    let colleges = parseSchools(raw.colleges ?? raw.colleges_json ?? raw.allowedColleges);
    if (college && !schoolMatches(college, colleges)) colleges = parseSchools([college, ...colleges]);
    if (!colleges.length) fail(400, "请填写要开放的学院");
    next.campusTargets = colleges.map((name) => emptyTarget(school, name));
    next.schools = [school];
    next.colleges = colleges;
    return next;
  }
  if (scope === "schools") {
    let targets = parseTargets(raw.campusTargets ?? raw.targets ?? raw.campus_targets);
    if (!targets.length) {
      let schools = parseSchools(raw.schools ?? raw.schools_json ?? raw.allowedSchools);
      if (school && !schoolMatches(school, schools)) schools = parseSchools([school, ...schools]);
      const colleges = parseSchools(raw.colleges ?? raw.colleges_json ?? raw.allowedColleges);
      targets = targetsFromSchoolsColleges(schools, colleges);
    }
    if (!targets.length) fail(400, "请填写要开放的学校-学院-专业组合");
    next.campusTargets = targets;
    next.schools = derivedSchools(targets);
    next.colleges = derivedColleges(targets);
    return next;
  }
  return next;
}

function parseEnrollLimit(body) {
  const raw = body && typeof body === "object" ? body : {};
  const schools = parseSchools(raw.schools ?? raw.schools_json ?? raw.allowedSchools);
  const colleges = parseSchools(raw.colleges ?? raw.colleges_json ?? raw.allowedColleges);
  let targets = parseTargets(raw.campusTargets ?? raw.targets ?? raw.campus_targets);
  if (!targets.length) targets = targetsFromSchoolsColleges(schools, colleges);
  const alumniOk = flagOn(raw.alumniOk ?? raw.alumni_ok, false);
  const oversub = flagOn(raw.oversub, false);
  const studentOnly =
    flagOn(raw.studentOnly ?? raw.student_only, false) || targets.length > 0 || schools.length > 0 || colleges.length > 0 || alumniOk;
  return {
    studentOnly: !!studentOnly,
    schools: derivedSchools(targets).length ? derivedSchools(targets) : schools,
    colleges: derivedColleges(targets),
    majors: derivedMajors(targets),
    targets,
    alumniOk: !!alumniOk,
    oversub: !!oversub,
  };
}

function resolveEnrollLimit(body, user) {
  const limit = parseEnrollLimit(applyCampusScope(withCampusFreeDefaults(body || {}), user || {}));
  if (limit.colleges.length && !limit.schools.length) fail(400, "限定学院时请同时限定学校");
  if (limit.targets.some((t) => t.college && !t.school)) fail(400, "学院必须挂在学校下面");
  if (limit.targets.some((t) => t.major && !t.college)) fail(400, "专业必须挂在学院下面");
  return limit;
}

function storedTargets(schedule) {
  if (!schedule) return [];
  const fromCol = parseTargets(schedule.campus_targets_json);
  if (fromCol.length) return fromCol;
  return targetsFromSchoolsColleges(namesFromStored(schedule.schools_json), namesFromStored(schedule.colleges_json));
}

function enrollLimitOf(schedule) {
  if (!schedule) {
    return { studentOnly: false, schools: [], colleges: [], majors: [], targets: [], alumniOk: false, oversub: false };
  }
  const targets = storedTargets(schedule);
  const alumniOk = flagOn(schedule.alumni_ok, false);
  const oversub = flagOn(schedule.oversub, false);
  const studentOnly = flagOn(schedule.student_only, false) || targets.length > 0 || alumniOk;
  return {
    studentOnly,
    schools: derivedSchools(targets),
    colleges: derivedColleges(targets),
    majors: derivedMajors(targets),
    targets,
    alumniOk,
    oversub,
  };
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
  const targets = limit.targets || [];
  if (targets.length) return targets.map(formatTarget).filter(Boolean).join("、");
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
  return !!(limit.studentOnly || (limit.targets && limit.targets.length) || limit.schools.length || limit.colleges.length || limit.alumniOk);
}

function targetMatchesUser(user, target) {
  if (!schoolMatches(user && user.school, [target.school])) return false;
  if (target.college && !schoolMatches(user && user.college, [target.college])) return false;
  if (target.major && !schoolMatches(user && user.major, [target.major])) return false;
  return true;
}

function checkEnrollLimit(user, limit) {
  if (!isCampusLimited(limit)) return { ok: true, reason: "" };
  if (!campusOk(user, limit)) return { ok: false, reason: limitReason(limit) };
  const targets = limit.targets || [];
  if (targets.length) {
    if (!targets.some((t) => targetMatchesUser(user, t))) return { ok: false, reason: limitReason(limit) };
    return { ok: true, reason: "" };
  }
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
  const targets = limit.targets || [];
  const schools = limit.schools || [];
  const colleges = limit.colleges || [];
  if (!schools.length && !targets.length) return "certified";
  const schoolNames = schools.length ? schools : derivedSchools(targets);
  const hasCollege = targets.some((t) => t.college) || colleges.length > 0;
  if (hasCollege && schoolNames.length <= 1) {
    const n = targets.filter((t) => t.college).length || colleges.length;
    return n === 1 ? "college" : "colleges";
  }
  if (schoolNames.length > 1) return "schools";
  if (schoolNames.length === 1) return "school";
  return "certified";
}

function eligibilityLabel(limit) {
  const who = limit.alumniOk ? "师生校友" : "";
  const place = campusPlace(limit);
  if (place) {
    const n = (limit.targets || []).length || limit.schools.length;
    if (n <= 4 && place.length <= 48) return `仅限${place}${who}`;
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
    majors: limit.majors,
    targets: limit.targets,
    scope: campusScopeOf(limit),
    canEnroll: checked.ok,
    reason: enabled && !checked.ok ? checked.reason : "",
    label: eligibilityLabel(limit),
  };
}

function persistEnrollLimit(id, limit) {
  getDb()
    .prepare(
      "UPDATE schedules SET student_only=?, schools_json=?, colleges_json=?, campus_targets_json=?, alumni_ok=?, oversub=? WHERE id=?"
    )
    .run(
      limit.studentOnly ? 1 : 0,
      JSON.stringify(limit.schools || []),
      JSON.stringify(limit.colleges || []),
      JSON.stringify(limit.targets || []),
      limit.alumniOk ? 1 : 0,
      limit.oversub ? 1 : 0,
      id
    );
  return limit;
}

function applyEnrollLimit(id, body, user) {
  return persistEnrollLimit(id, resolveEnrollLimit(body, user));
}

function sameSchool(a, b) {
  return !!(a && b && (schoolMatches(a, [b]) || schoolMatches(b, [a])));
}

function targetCovers(wide, narrow) {
  if (!wide || !narrow || !sameSchool(wide.school, narrow.school)) return false;
  if (!wide.college) return true;
  if (!narrow.college || !sameSchool(wide.college, narrow.college)) return false;
  if (!wide.major) return true;
  if (!narrow.major) return false;
  return sameSchool(wide.major, narrow.major);
}

function mergeTargets(list) {
  const out = [];
  for (const t of list || []) {
    if (!t || !t.school) continue;
    if (out.some((w) => targetCovers(w, t))) continue;
    for (let i = out.length - 1; i >= 0; i -= 1) {
      if (targetCovers(t, out[i])) out.splice(i, 1);
    }
    out.push(emptyTarget(t.school, t.college, t.major));
  }
  return out;
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
  const extra = parseTargets(raw.addTargets ?? raw.add_targets ?? raw.campusTargets);
  for (const school of [...incomingSchools, ...addSchools]) extra.push(emptyTarget(school));
  const collegeNames = [...incomingColleges, ...addColleges];
  if (collegeNames.length) {
    const host = String(raw.school || raw.campusSchool || (current.schools.length === 1 ? current.schools[0] : "")).trim();
    if (!host) fail(400, "开放学院时请写明学校，两校同名学院不能混在一起");
    for (const college of collegeNames) extra.push(emptyTarget(host, college));
  }
  if (!extra.length && !openAllColleges) fail(400, "请填写要开放的学院或学校");
  if (!current.schools.length && extra.some((t) => t.school)) {
    fail(400, "当前未限定学校，不能再收窄到指定高校");
  }
  for (const t of extra) {
    const wider = current.targets.find((w) => targetCovers(w, t) && !targetCovers(t, w));
    if (wider) fail(400, "当前本校各学院均可报名，不能再收窄到指定学院");
  }
  let nextTargets = [...current.targets, ...extra];
  if (openAllColleges) nextTargets = nextTargets.map((t) => emptyTarget(t.school));
  nextTargets = mergeTargets(nextTargets);
  return persistEnrollLimit(schedule.id, {
    studentOnly: true,
    schools: derivedSchools(nextTargets),
    colleges: derivedColleges(nextTargets),
    majors: derivedMajors(nextTargets),
    targets: nextTargets,
    alumniOk: current.alumniOk || flagOn(raw.alumniOk ?? raw.alumni_ok, false),
    oversub: raw.oversub === undefined ? current.oversub : flagOn(raw.oversub, false),
  });
}

module.exports = {
  parseSchools,
  parseTargets,
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
  emptyTarget,
  formatTarget,
};
