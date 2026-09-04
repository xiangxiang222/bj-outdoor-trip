const { getDb } = require("../db");
const { isStudent } = require("./helpers");
const { maskName } = require("./biz");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function isStudentGroup(user) {
  return !!(user && user.group_status === "approved");
}

function canJoinCombo(user) {
  return isStudent(user) || isStudentGroup(user);
}

function parseComboRule(input) {
  const raw = input && typeof input === "object" ? input : {};
  const requireKind = ["student", "group", "student_or_group"].includes(raw.require) ? raw.require : "student_or_group";
  return {
    require: requireKind,
    school: String(raw.school || "").trim().slice(0, 40),
  };
}

function comboRuleOf(schedule) {
  if (!schedule || schedule.offer_type !== "combo") return null;
  try {
    return parseComboRule(JSON.parse(schedule.combo_rule_json || "{}"));
  } catch {
    return parseComboRule({});
  }
}

function parseComboWant(input) {
  const raw = input && typeof input === "object" ? input : {};
  const wantGender = ["male", "female"].includes(raw.wantGender) ? raw.wantGender : "any";
  return {
    wantGender,
    wantSchool: String(raw.wantSchool || "").trim().slice(0, 40),
    note: String(raw.note || raw.comboNote || "").trim().slice(0, 80),
  };
}

function assertCanOpenCombo(user) {
  if (!canJoinCombo(user)) fail(400, "组合团目前只对学生或已认证的学生组织开放");
}

function assertComboEnroll(user, schedule) {
  if (!schedule || schedule.offer_type !== "combo") return;
  if (!canJoinCombo(user)) fail(400, "组合团目前只对学生或已认证的学生组织开放");
  const rule = comboRuleOf(schedule) || parseComboRule({});
  if (rule.require === "student" && !isStudent(user)) fail(400, "本团要求报名学生认证");
  if (rule.require === "group" && !isStudentGroup(user)) fail(400, "本团要求报名已认证的学生组织");
  if (rule.school) {
    const school = String(user.school || "").trim();
    if (!school || !school.includes(rule.school)) fail(400, `本团另一半需来自${rule.school}`);
  }
}

function listComboMates(scheduleId) {
  const rows = getDb()
    .prepare(
      `SELECT e.gender, e.combo_json, u.nickname, u.school, u.group_name
       FROM enrollments e
       LEFT JOIN users u ON u.id=e.user_id
       WHERE e.schedule_id=? AND e.status='joined'
       ORDER BY e.id`
    )
    .all(scheduleId);
  return rows.map((row) => {
    let want = {};
    try {
      want = JSON.parse(row.combo_json || "{}");
    } catch {
      want = {};
    }
    return {
      name: maskName(row.nickname),
      school: row.school || row.group_name || "",
      gender: row.gender || "",
      wantGender: want.wantGender || "any",
      wantSchool: want.wantSchool || "",
      note: want.note || "",
    };
  });
}

function comboView(schedule, user) {
  if (!schedule || schedule.offer_type !== "combo") return { enabled: false };
  return {
    enabled: true,
    canJoin: canJoinCombo(user),
    rule: comboRuleOf(schedule),
    mates: listComboMates(schedule.id),
  };
}

module.exports = {
  canJoinCombo,
  parseComboRule,
  parseComboWant,
  comboRuleOf,
  assertCanOpenCombo,
  assertComboEnroll,
  listComboMates,
  comboView,
};
