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
  return Math.min(100, Math.max(0, n));
}

function maleShare(male, female) {
  const m = num(male, 50);
  const f = num(female, 50);
  const total = m + f;
  if (!total) return 50;
  return Math.min(100, Math.max(0, Math.round((100 * m) / total)));
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
    if (!prev) return { school, on: true, male: overall.male, female: overall.female, share: maleShare(overall.male, overall.female) };
    const share = maleShare(prev.male, prev.female);
    return { school, on: true, male: share, female: 100 - share, share };
  });
  const prevColleges = {};
  (base.genderColleges || []).forEach((row) => {
    prevColleges[row.school + "\0" + row.college] = row;
  });
  const genderColleges = groups.colleges.map((row) => {
    const prev = prevColleges[row.school + "\0" + row.college];
    if (!prev) {
      const share = maleShare(overall.male, overall.female);
      return { school: row.school, college: row.college, on: true, male: share, female: 100 - share, share };
    }
    const share = maleShare(prev.male, prev.female);
    return { school: row.school, college: row.college, on: true, male: share, female: 100 - share, share };
  });
  return { genderSchools, genderColleges };
}

function payload(form) {
  if (form.organizerType !== "campus" || form.channel === "activity" || !form.genderRatioOn) return { on: false };
  return {
    on: true,
    overall: { male: maleShare(form.overallMale, form.overallFemale), female: 100 - maleShare(form.overallMale, form.overallFemale) },
    schools: (form.genderSchools || []).map((row) => {
      const male = maleShare(row.male, row.female);
      return { school: row.school, male, female: 100 - male };
    }),
    colleges: (form.genderColleges || []).map((row) => {
      const male = maleShare(row.male, row.female);
      return { school: row.school, college: row.college, male, female: 100 - male };
    }),
  };
}

module.exports = { syncGenderRatio, payload };
