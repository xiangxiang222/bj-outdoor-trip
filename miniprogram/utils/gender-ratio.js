function groupsFromTargets(targets) {
  const schools = [];
  (targets || []).forEach((raw) => {
    const school = String((raw && raw.school) || "").trim();
    if (!school || schools.indexOf(school) >= 0) return;
    schools.push(school);
  });
  return { schools };
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
  const groups = groupsFromTargets(targets);
  const prevSchools = {};
  (base.genderSchools || []).forEach((row) => {
    prevSchools[row.school] = row;
  });
  const genderSchools = groups.schools.map((school) => {
    const prev = prevSchools[school];
    if (!prev) return { school, on: false, male: 50, female: 50, share: 50 };
    const share = maleShare(prev.male, prev.female);
    return { school, on: !!prev.on, male: share, female: 100 - share, share };
  });
  return { genderSchools, genderColleges: [] };
}

function payload(form) {
  if (form.organizerType !== "campus" || form.channel === "activity") return { on: false };
  const schools = (form.genderSchools || []).filter((row) => row && row.on && row.school);
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
  if (!form.genderRatioOn) return { on: false };
  const male = maleShare(form.overallMale, form.overallFemale);
  return { on: true, overall: { male, female: 100 - male }, schools: [], colleges: [] };
}

module.exports = { syncGenderRatio, payload };
