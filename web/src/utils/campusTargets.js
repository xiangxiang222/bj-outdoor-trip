export function emptyCampusTarget(school = "", college = "", major = "") {
  return {
    school: String(school || "").trim(),
    college: String(college || "").trim(),
    major: String(major || "").trim(),
  };
}

export function normalizeCampusTargets(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of list) {
    const t = emptyCampusTarget(row && row.school, row && row.college, row && row.major);
    if (!t.school) continue;
    if (!t.college) t.major = "";
    const key = `${t.school}\0${t.college}\0${t.major}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function formatCampusTarget(row) {
  const t = emptyCampusTarget(row && row.school, row && row.college, row && row.major);
  return [t.school, t.college, t.major].filter(Boolean).join(" · ");
}
