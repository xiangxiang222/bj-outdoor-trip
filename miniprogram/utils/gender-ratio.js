function groupsFromTargets(targets) {
  const schools = [];
  const collegesBySchool = {};
  (targets || []).forEach((raw) => {
    const school = String((raw && raw.school) || "").trim();
    if (!school) return;
    if (schools.indexOf(school) < 0) schools.push(school);
    const college = String(raw.college || "").trim();
    if (!college) return;
    const list = collegesBySchool[school] || [];
    if (list.indexOf(college) < 0) list.push(college);
    collegesBySchool[school] = list;
  });
  const collegeRows = [];
  Object.keys(collegesBySchool).forEach((school) => {
    const colleges = collegesBySchool[school];
    if (colleges.length < 2) return;
    colleges.forEach((college) => collegeRows.push({ school, college }));
  });
  return { schools: schools.length >= 2 ? schools : [], colleges: collegeRows };
}

function num(value, fallback) {
  const n = Math.round(Number(value));
  if (!isFinite(n)) return fallback;
  return Math.min(99, Math.max(0, n));
}

function syncGenderRatio(current, targets) {
  const base = current || {};
  const overall = {
    male: num(base.overallMale, 1),
    female: num(base.overallFemale, 1),
  };
  const groups = groupsFromTargets(targets);
  const prevSchools = {};
  (base.genderSchools || []).forEach((row) => {
    prevSchools[row.school] = row;
  });
  const genderSchools = groups.schools.map((school) => {
    const prev = prevSchools[school];
    if (!prev) return { school, on: false, male: overall.male, female: overall.female };
    return { school, on: !!prev.on, male: num(prev.male, overall.male), female: num(prev.female, overall.female) };
  });
  const prevColleges = {};
  (base.genderColleges || []).forEach((row) => {
    prevColleges[row.school + "\0" + row.college] = row;
  });
  const genderColleges = groups.colleges.map((row) => {
    const prev = prevColleges[row.school + "\0" + row.college];
    if (!prev) return { school: row.school, college: row.college, on: false, male: overall.male, female: overall.female };
    return {
      school: row.school,
      college: row.college,
      on: !!prev.on,
      male: num(prev.male, overall.male),
      female: num(prev.female, overall.female),
    };
  });
  return { genderSchools, genderColleges };
}

function payload(form) {
  if (form.organizerType !== "campus" || form.channel === "activity" || !form.genderRatioOn) return { on: false };
  return {
    on: true,
    overall: { male: num(form.overallMale, 1), female: num(form.overallFemale, 1) },
    schools: (form.genderSchools || [])
      .filter((row) => row.on)
      .map((row) => ({ school: row.school, male: num(row.male, 1), female: num(row.female, 1) })),
    colleges: (form.genderColleges || [])
      .filter((row) => row.on)
      .map((row) => ({ school: row.school, college: row.college, male: num(row.male, 1), female: num(row.female, 1) })),
  };
}

module.exports = { syncGenderRatio, payload };
