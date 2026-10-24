const { getDb } = require("../db");
const { schoolMatches } = require("./eligibility");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function off() {
  return { on: false, overall: null, schools: [], colleges: [], label: "" };
}

function pair(male, female) {
  const m = Math.round(Number(male));
  const f = Math.round(Number(female));
  if (!Number.isInteger(m) || !Number.isInteger(f) || m < 0 || f < 0 || m > 100 || f > 100 || m + f < 1) {
    fail(400, "男女比例请填 0 到 100 的整数，不能两边都是 0");
  }
  return { male: m, female: f };
}

function namedSchools(targets) {
  const schools = [];
  for (const raw of targets || []) {
    const school = String(raw && raw.school || "").trim();
    if (school && !schools.includes(school)) schools.push(school);
  }
  return schools;
}

function groupsFromTargets(targets) {
  const schools = [];
  const collegesBySchool = new Map();
  for (const raw of targets || []) {
    const school = String(raw && raw.school || "").trim();
    if (!school) continue;
    if (!schools.includes(school)) schools.push(school);
    const college = String(raw.college || "").trim();
    if (!college) continue;
    const list = collegesBySchool.get(school) || [];
    if (!list.includes(college)) list.push(college);
    collegesBySchool.set(school, list);
  }
  const collegeRows = [];
  for (const [school, colleges] of collegesBySchool) {
    if (colleges.length < 2) continue;
    for (const college of colleges) collegeRows.push({ school, college });
  }
  return { schools: schools.length >= 2 ? schools : [], colleges: collegeRows };
}

function normalize(body, targets) {
  const src = body && typeof body === "object" ? body : {};
  const on = src.on === true || src.on === 1 || src.on === "1" || src.on === "true";
  if (!on) return off();
  const allowed = new Set(namedSchools(targets));
  const schools = [];
  for (const row of Array.isArray(src.schools) ? src.schools : []) {
    if (!row || row.on === false) continue;
    const school = String(row.school || "").trim();
    if (!allowed.has(school)) continue;
    schools.push({ school, ...pair(row.male, row.female) });
  }
  if (schools.length) {
    const rule = { on: true, overall: null, schools, colleges: [] };
    rule.label = labelOf(rule);
    return rule;
  }
  const overall = pair(src.overall && src.overall.male != null ? src.overall.male : src.male != null ? src.male : 1, src.overall && src.overall.female != null ? src.overall.female : src.female != null ? src.female : 1);
  const rule = { on: true, overall, schools: [], colleges: [] };
  rule.label = labelOf(rule);
  return rule;
}

function caps(seats, male, female) {
  const total = Math.max(0, Math.round(Number(seats) || 0));
  const ratio = pair(male, female);
  if (total < 1) return { male: 0, female: 0 };
  if (ratio.male === 0) return { male: 0, female: total };
  if (ratio.female === 0) return { male: total, female: 0 };
  const maleCap = Math.floor((total * ratio.male) / (ratio.male + ratio.female));
  return { male: maleCap, female: total - maleCap };
}

function labelOf(rule) {
  if (!rule || !rule.on) return "";
  if ((rule.schools || []).length) {
    return `男女比例 ${(rule.schools || []).map((row) => `${row.school} ${row.male}:${row.female}`).join("，")}`;
  }
  if (!rule.overall) return "";
  return `男女比例 全团 ${rule.overall.male}:${rule.overall.female}`;
}

function readRule(raw) {
  if (!raw) return off();
  let data = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return off();
    try {
      data = JSON.parse(text);
    } catch {
      return off();
    }
  }
  if (!data || !data.on) return off();
  try {
    const schools = (Array.isArray(data.schools) ? data.schools : [])
      .map((row) => ({ school: String(row.school || "").trim(), ...pair(row.male, row.female) }))
      .filter((row) => row.school);
    const overall = schools.length || !data.overall ? null : pair(data.overall.male, data.overall.female);
    if (!overall && !schools.length) return off();
    const rule = { on: true, overall, schools, colleges: [] };
    rule.label = labelOf(rule);
    return rule;
  } catch {
    return off();
  }
}

function genderRatioPublic(schedule) {
  return readRule(schedule && schedule.gender_ratio_json);
}

function saveGenderRatio(id, body, targets, organizerType) {
  if (!body || (body.genderRatio == null && body.gender_ratio == null)) return null;
  const raw = body.genderRatio != null ? body.genderRatio : body.gender_ratio;
  const rule = String(organizerType || "") === "campus" ? normalize(raw, targets) : off();
  getDb().prepare("UPDATE schedules SET gender_ratio_json=? WHERE id=?").run(JSON.stringify(rule), id);
  return rule;
}

function roster(scheduleId) {
  return getDb()
    .prepare(
      `SELECT e.gender AS gender, u.school AS school, u.college AS college
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
       WHERE e.schedule_id=? AND e.status IN ('joined','applied') AND COALESCE(u.is_virtual,0)=0`
    )
    .all(scheduleId)
    .map((row) => ({
      gender: row.gender === "female" ? "female" : row.gender === "male" ? "male" : "",
      school: row.school || "",
      college: row.college || "",
    }));
}

function sideName(gender) {
  return gender === "male" ? "男生" : "女生";
}

function assertBucket(rows, gender, ratio, seats, where) {
  const room = caps(seats, ratio.male, ratio.female);
  const used = rows.filter((row) => row.gender === gender).length;
  if (used >= room[gender]) {
    fail(400, `${where}的${sideName(gender)}名额已满。按 ${ratio.male}:${ratio.female}，${seats} 个座位里最多 ${room[gender]} 人`);
  }
}

function bestSchoolRule(rules, school) {
  return (rules || [])
    .filter((row) => schoolMatches(school, [row.school]))
    .sort((a, b) => String(b.school).length - String(a.school).length)[0];
}

function assertGenderRatio(schedule, user, gender) {
  if (!schedule || schedule.channel === "activity") return;
  if (user && Number(user.is_virtual) === 1) return;
  const rule = readRule(schedule.gender_ratio_json);
  if (!rule.on) return;
  if (gender !== "male" && gender !== "female") fail(400, "这个团限制了男女比例，请填写身份证");
  const seats = Number(schedule.max_seats) || 0;
  const rows = roster(schedule.id);
  if ((rule.schools || []).length) {
    const schoolRule = bestSchoolRule(rule.schools, user && user.school);
    if (schoolRule) {
      const mine = rows.filter((row) => schoolMatches(row.school, [schoolRule.school]));
      assertBucket(mine, gender, schoolRule, seats, schoolRule.school);
    }
    return;
  }
  if (rule.overall) assertBucket(rows, gender, rule.overall, seats, "全团");
}

module.exports = {
  groupsFromTargets,
  normalize,
  caps,
  readRule,
  genderRatioPublic,
  saveGenderRatio,
  assertGenderRatio,
};
