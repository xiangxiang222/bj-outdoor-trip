const bcrypt = require("bcryptjs");
const { getDb } = require("../db");

const ROLES = new Set(["admin", "operator", "leader", "photographer"]);
const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,31}$/;
const ROLE_LABELS = {
  admin: "超级管理员",
  operator: "运营",
  leader: "领队",
  photographer: "摄影",
};
const CAPS = {
  admin: ["staff", "ops", "field", "roster", "photo"],
  operator: ["ops", "field", "roster", "photo"],
  leader: ["field", "roster", "photo"],
  photographer: ["roster", "photo"],
};

function capsOf(role) {
  return CAPS[role] || [];
}

function hasCap(role, cap) {
  return capsOf(role).includes(cap);
}

function roleLabel(role) {
  return ROLE_LABELS[role] || ROLE_LABELS.admin;
}

function requireCap(...needed) {
  return (req, res, next) => {
    if (needed.every((cap) => hasCap(req.adminRole, cap))) return next();
    res.status(403).json({ ok: false, message: "当前角色无权做这项操作" });
  };
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function publicStaff(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role || "admin",
    roleLabel: roleLabel(row.role || "admin"),
    caps: capsOf(row.role || "admin"),
    status: row.status || "on",
    createdAt: row.created_at,
  };
}

function getStaff(id) {
  return getDb().prepare("SELECT * FROM admin_users WHERE id=?").get(id);
}

function listStaff() {
  return getDb()
    .prepare("SELECT id, username, name, role, status, created_at FROM admin_users ORDER BY id")
    .all()
    .map(publicStaff);
}

function countActiveAdmins(exceptId) {
  const db = getDb();
  const sql =
    "SELECT COUNT(*) c FROM admin_users WHERE role='admin' AND IFNULL(status,'on')='on'" +
    (exceptId ? " AND id!=?" : "");
  return exceptId ? db.prepare(sql).get(exceptId).c : db.prepare(sql).get().c;
}

function assertKeepAdmin(id, nextRole, nextStatus) {
  const row = getStaff(id);
  if (!row) fail(404, "管理员不存在");
  const role = nextRole || row.role || "admin";
  const status = nextStatus || row.status || "on";
  const stillAdmin = role === "admin" && status === "on";
  if (!stillAdmin && countActiveAdmins(id) < 1) {
    fail(400, "至少保留一名启用中的管理员");
  }
}

function normalizeRole(role) {
  const value = role || "admin";
  if (!ROLES.has(value)) fail(400, "角色只能是超级管理员、运营、领队或摄影");
  return value;
}

function normalizeStatus(status) {
  const value = status || "on";
  if (value !== "on" && value !== "off") fail(400, "状态无效");
  return value;
}

function hashPassword(password, label = "密码至少 6 位") {
  if (!password || String(password).length < 6) fail(400, label);
  return bcrypt.hashSync(String(password), 10);
}

function createStaff({ username, name, password, role }) {
  const user = String(username || "").trim();
  const display = String(name || "").trim();
  if (!USERNAME_RE.test(user)) fail(400, "账号需 3–32 位，字母开头，仅字母数字下划线");
  if (!display || display.length > 20) fail(400, "请填写不超过 20 字的姓名");
  const passwordHash = hashPassword(password);
  const nextRole = normalizeRole(role);
  try {
    const info = getDb()
      .prepare("INSERT INTO admin_users (username, password_hash, name, role, status) VALUES (?,?,?,?,?)")
      .run(user, passwordHash, display, nextRole, "on");
    return publicStaff(getStaff(Number(info.lastInsertRowid)));
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) fail(400, "账号已存在");
    throw e;
  }
}

function updateStaff(id, { name, role, password, status }, actorId) {
  const row = getStaff(id);
  if (!row) fail(404, "管理员不存在");
  const display = name == null ? row.name : String(name).trim();
  if (!display || display.length > 20) fail(400, "请填写不超过 20 字的姓名");
  const nextRole = role == null ? row.role || "admin" : normalizeRole(role);
  const nextStatus = status == null ? row.status || "on" : normalizeStatus(status);
  if (Number(id) === Number(actorId) && nextStatus === "off") fail(400, "不能停用当前登录账号");
  assertKeepAdmin(id, nextRole, nextStatus);
  const db = getDb();
  if (password) {
    db.prepare("UPDATE admin_users SET name=?, role=?, status=?, password_hash=? WHERE id=?").run(
      display,
      nextRole,
      nextStatus,
      hashPassword(password),
      id
    );
  } else {
    db.prepare("UPDATE admin_users SET name=?, role=?, status=? WHERE id=?").run(display, nextRole, nextStatus, id);
  }
  return publicStaff(getStaff(id));
}

function deleteStaff(id, actorId) {
  if (Number(id) === Number(actorId)) fail(400, "不能删除当前登录账号");
  assertKeepAdmin(id, "operator", "off");
  const row = getStaff(id);
  if (!row) fail(404, "管理员不存在");
  getDb().prepare("DELETE FROM admin_users WHERE id=?").run(id);
  return { deleted: true, id: Number(id) };
}

function changeOwnPassword(id, oldPassword, newPassword) {
  const row = getStaff(id);
  if (!row) fail(404, "管理员不存在");
  if (!oldPassword || !bcrypt.compareSync(String(oldPassword), row.password_hash)) {
    fail(400, "原密码不正确");
  }
  if (String(newPassword || "") === String(oldPassword || "")) fail(400, "新密码不能与原密码相同");
  getDb().prepare("UPDATE admin_users SET password_hash=? WHERE id=?").run(hashPassword(newPassword), id);
  return { ok: true };
}

module.exports = {
  ROLES,
  ROLE_LABELS,
  publicStaff,
  getStaff,
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  changeOwnPassword,
  capsOf,
  hasCap,
  roleLabel,
  requireCap,
};
