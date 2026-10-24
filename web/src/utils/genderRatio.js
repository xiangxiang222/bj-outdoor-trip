export function emptyGenderRatio() {
  return { on: false, overall: { male: 50, female: 50 }, schools: [], colleges: [] };
}

export function groupsFromTargets(targets) {
  const schools = [];
  const collegesBySchool = new Map();
  for (const raw of targets || []) {
    const school = String((raw && raw.school) || "").trim();
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

function num(value, fallback = 1) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

export function maleShare(male, female) {
  const m = num(male, 50);
  const f = num(female, 50);
  const total = m + f;
  if (!total) return 50;
  return Math.min(100, Math.max(0, Math.round((100 * m) / total)));
}

export function schoolNames(targets) {
  const schools = [];
  for (const raw of targets || []) {
    const school = String((raw && raw.school) || "").trim();
    if (school && !schools.includes(school)) schools.push(school);
  }
  return schools;
}

export function syncGenderRatio(current, targets) {
  const base = current && typeof current === "object" ? current : emptyGenderRatio();
  const overall = { male: num(base.overall && base.overall.male, 50), female: num(base.overall && base.overall.female, 50) };
  const prevSchools = new Map((base.schools || []).map((row) => [row.school, row]));
  const schools = schoolNames(targets).map((school) => {
    const prev = prevSchools.get(school);
    if (!prev) return { school, on: false, male: 50, female: 50 };
    return { school, on: !!prev.on, male: num(prev.male, 50), female: num(prev.female, 50) };
  });
  const schoolMode = schools.some((row) => row.on);
  return { on: schoolMode ? false : !!base.on, overall, schools, colleges: [] };
}

export function setSchoolRatioOn(model, school, on) {
  const name = String(school || "").trim();
  const current = model && typeof model === "object" ? model : emptyGenderRatio();
  if (!name) return current;
  const schools = (current.schools || []).slice();
  const index = schools.findIndex((row) => row.school === name);
  if (index < 0) schools.push({ school: name, on: !!on, male: 50, female: 50 });
  else schools[index] = { ...schools[index], on: !!on };
  const schoolMode = schools.some((row) => row.on);
  return { ...current, on: schoolMode ? false : !!current.on, schools, colleges: [] };
}

export function setSchoolShare(model, school, share) {
  const name = String(school || "").trim();
  const current = model && typeof model === "object" ? model : emptyGenderRatio();
  const male = Math.min(100, Math.max(0, Math.round(Number(share) || 0)));
  const schools = (current.schools || []).slice();
  const index = schools.findIndex((row) => row.school === name);
  const next = { school: name, on: true, male, female: 100 - male };
  if (index < 0) schools.push(next);
  else schools[index] = { ...schools[index], ...next };
  return { ...current, on: false, schools, colleges: [] };
}

export function genderRatioPayload(model) {
  const ratio = model || emptyGenderRatio();
  const schools = (ratio.schools || []).filter((row) => row && row.on && String(row.school || "").trim());
  if (schools.length) {
    return {
      on: true,
      schools: schools.map((row) => {
        const male = maleShare(row.male, row.female);
        return { school: row.school, male, female: 100 - male };
      }),
      colleges: [],
    };
  }
  if (!ratio.on) return { on: false };
  const male = maleShare(ratio.overall && ratio.overall.male, ratio.overall && ratio.overall.female);
  return { on: true, overall: { male, female: 100 - male }, schools: [], colleges: [] };
}

export function genderRatioFromSaved(saved) {
  const src = saved || {};
  const schools = (src.schools || [])
    .map((item) => ({ school: item.school, on: true, male: item.male, female: item.female }))
    .filter((item) => item.school);
  const overall = src.overall && src.overall.male != null ? src.overall : { male: 50, female: 50 };
  return { on: !!src.on && !schools.length, overall, schools, colleges: [] };
}

export function applyCampusPublish(payload) {
  delete payload.campusScope;
  delete payload.campusSchool;
  delete payload.campusCollege;
  delete payload.schools;
  delete payload.colleges;
  delete payload.lotteryMode;
  if (payload.organizerType !== "campus") {
    delete payload.genderRatio;
    payload.studentOnly = false;
    payload.alumniOk = false;
    payload.oversub = false;
    payload.campusTargets = [];
    return payload;
  }
  payload.genderRatio = genderRatioPayload(payload.genderRatio);
  if (payload.offerType === "free") {
    payload.oversub = true;
    payload.studentOnly = true;
  }
  return payload;
}
