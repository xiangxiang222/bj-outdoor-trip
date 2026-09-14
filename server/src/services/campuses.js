"use strict";

const { SCHOOLS, COLLEGE_SETS, majorsForCollegeName } = require("../data/beijingCampuses");

const KINDS = new Set(["school", "college", "major"]);
const NAME_SPLIT = /[,，;；\n]+/;

function fold(s) {
  return String(s || "").replace(/\s+/g, "").toLowerCase();
}

function matchesQuery(name, aliases, q) {
  const n = fold(q);
  if (!n) return true;
  const hay = [name, ...(aliases || [])].map(fold);
  return hay.some((h) => h.includes(n) || (n.length >= 2 && n.includes(h)));
}

function uniqueNames(list) {
  const seen = new Set();
  const out = [];
  for (const name of list) {
    const n = String(name || "").trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function parseNames(raw) {
  if (Array.isArray(raw)) {
    const nested = [];
    for (const item of raw) nested.push(...parseNames(item));
    return uniqueNames(nested);
  }
  return uniqueNames(String(raw || "").split(NAME_SPLIT));
}

function findSchool(name) {
  const n = fold(name);
  if (!n) return null;
  const exact = SCHOOLS.find((s) => fold(s.name) === n || (s.aliases || []).some((a) => fold(a) === n));
  if (exact) return exact;
  return SCHOOLS.find((s) => matchesQuery(s.name, s.aliases, name)) || null;
}

function guessCollegeSet(schoolName) {
  const n = String(schoolName || "");
  if (/职业学院|职业技术/.test(n)) return COLLEGE_SETS.vocational;
  if (/医科|医学院|协和|中医药/.test(n)) return COLLEGE_SETS.medical;
  if (/音乐|美术|戏剧|电影|舞蹈|戏曲|服装/.test(n)) return COLLEGE_SETS.art;
  if (/外国语|语言大学|外交/.test(n)) return COLLEGE_SETS.language;
  if (/财经|经贸|工商|物资/.test(n)) return COLLEGE_SETS.finance;
  if (/体育/.test(n)) return COLLEGE_SETS.sports;
  if (/公安|警察|消防/.test(n)) return COLLEGE_SETS.police;
  if (/工业|理工|航空|交通|邮电|化工|石油|地质|矿业|建筑|印刷/.test(n)) return COLLEGE_SETS.engineering;
  return COLLEGE_SETS.comprehensive;
}

function findCollege(school, collegeName) {
  const n = fold(collegeName);
  if (!school || !n) return null;
  return (
    school.colleges.find((c) => fold(c.name) === n) ||
    school.colleges.find((c) => matchesQuery(c.name, [], collegeName)) ||
    null
  );
}

function collegesOfSchool(schoolName) {
  const sch = findSchool(schoolName);
  if (sch) return sch.colleges.map((c) => c.name);
  if (String(schoolName || "").trim()) return guessCollegeSet(schoolName);
  return [];
}

function collegesOfSchools(schoolNames) {
  const names = parseNames(schoolNames);
  const out = [];
  for (const school of names) out.push(...collegesOfSchool(school));
  return uniqueNames(out);
}

function majorsForCollege(collegeName, schoolName) {
  const n = String(collegeName || "").trim();
  if (!n) return [];
  if (schoolName) {
    const sch = findSchool(schoolName);
    const col = findCollege(sch, n);
    if (col) {
      if (col.majors && col.majors.length) return col.majors.slice();
      return majorsForCollegeName(col.name);
    }
  }
  return majorsForCollegeName(n);
}

function majorsOf(collegeNames, schoolNames) {
  const colleges = parseNames(collegeNames);
  if (!colleges.length) return [];
  const schools = parseNames(schoolNames);
  const out = [];
  if (schools.length) {
    for (const school of schools) {
      for (const college of colleges) out.push(...majorsForCollege(college, school));
    }
    return uniqueNames(out);
  }
  for (const college of colleges) out.push(...majorsForCollege(college));
  return uniqueNames(out);
}

function paginate(names, q, page, pageSize, filterByQuery = true) {
  const query = String(q || "").trim();
  const filtered = filterByQuery ? names.filter((name) => matchesQuery(name, [], query)) : names;
  const size = Math.min(50, Math.max(1, Number(pageSize) || 20));
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const p = Math.min(pages, Math.max(1, Number(page) || 1));
  const start = (p - 1) * size;
  const list = filtered.slice(start, start + size).map((name) => ({ name }));
  const custom = query.length >= 2 && total === 0 ? query : "";
  return { list, total, page: p, pageSize: size, custom };
}

function queryCampuses(raw) {
  const kind = String((raw && raw.kind) || "school").toLowerCase();
  if (!KINDS.has(kind)) {
    const err = new Error("kind 须为 school、college 或 major");
    err.status = 400;
    throw err;
  }
  const q = String((raw && raw.q) || "").trim();
  const schools = parseNames(raw && raw.school);
  const colleges = parseNames(raw && raw.college);
  const page = raw && raw.page;
  const pageSize = raw && raw.pageSize;
  if (kind === "school") {
    const filtered = q ? SCHOOLS.filter((s) => matchesQuery(s.name, s.aliases, q)).map((s) => s.name) : SCHOOLS.map((s) => s.name);
    return paginate(filtered, q, page, pageSize, false);
  }
  if (kind === "college") {
    return paginate(collegesOfSchools(schools), q, page, pageSize);
  }
  return paginate(majorsOf(colleges, schools), q, page, pageSize);
}

module.exports = {
  queryCampuses,
  findSchool,
  collegesOfSchool,
  collegesOfSchools,
  majorsForCollege,
  SCHOOL_COUNT: SCHOOLS.length,
};
