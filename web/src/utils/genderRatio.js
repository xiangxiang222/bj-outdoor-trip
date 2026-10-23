export function emptyGenderRatio() {
  return { on: false, overall: { male: 1, female: 1 }, schools: [], colleges: [] };
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
  return Math.min(99, Math.max(0, n));
}

export function syncGenderRatio(current, targets) {
  const base = current && typeof current === "object" ? current : emptyGenderRatio();
  const overall = { male: num(base.overall && base.overall.male, 1), female: num(base.overall && base.overall.female, 1) };
  const groups = groupsFromTargets(targets);
  const prevSchools = new Map((base.schools || []).map((row) => [row.school, row]));
  const schools = groups.schools.map((school) => {
    const prev = prevSchools.get(school);
    if (!prev) return { school, on: false, male: overall.male, female: overall.female };
    return { school, on: prev.on !== false, male: num(prev.male, overall.male), female: num(prev.female, overall.female) };
  });
  const prevColleges = new Map((base.colleges || []).map((row) => [`${row.school}\0${row.college}`, row]));
  const colleges = groups.colleges.map((row) => {
    const prev = prevColleges.get(`${row.school}\0${row.college}`);
    if (!prev) return { school: row.school, college: row.college, on: false, male: overall.male, female: overall.female };
    return {
      school: row.school,
      college: row.college,
      on: prev.on !== false,
      male: num(prev.male, overall.male),
      female: num(prev.female, overall.female),
    };
  });
  return { on: !!base.on, overall, schools, colleges };
}

export function genderRatioPayload(model) {
  const ratio = model || emptyGenderRatio();
  if (!ratio.on) return { on: false };
  return {
    on: true,
    overall: { male: num(ratio.overall && ratio.overall.male, 1), female: num(ratio.overall && ratio.overall.female, 1) },
    schools: (ratio.schools || [])
      .filter((row) => row.on)
      .map((row) => ({ school: row.school, male: num(row.male, 1), female: num(row.female, 1) })),
    colleges: (ratio.colleges || [])
      .filter((row) => row.on)
      .map((row) => ({ school: row.school, college: row.college, male: num(row.male, 1), female: num(row.female, 1) })),
  };
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
    return payload;
  }
  payload.genderRatio = genderRatioPayload(payload.genderRatio);
  if (payload.offerType === "free") {
    payload.oversub = true;
    payload.studentOnly = true;
  }
  return payload;
}
