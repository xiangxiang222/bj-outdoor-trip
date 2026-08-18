const jwt = require("jsonwebtoken");
const config = require("../config");
const { getDb } = require("../db");

function signUser(user) {
  return jwt.sign({ uid: user.id, role: user.role || "user", typ: "user" }, config.jwtSecret, { expiresIn: config.jwtExpire });
}

function signAdmin(admin) {
  return jwt.sign({ aid: admin.id, role: admin.role, typ: "admin" }, config.jwtSecret, { expiresIn: config.adminJwtExpire });
}

function signGuide(guide) {
  return jwt.sign({ gid: guide.id, typ: "guide" }, config.jwtSecret, { expiresIn: config.jwtExpire });
}

function activeUser(id) {
  if (!id) return null;
  const row = getDb().prepare("SELECT id, role, deleted_at FROM users WHERE id=?").get(id);
  if (!row || row.deleted_at) return null;
  return row;
}

function authUser(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ ok: false, message: "请先登录" });
  try {
    const p = jwt.verify(token, config.jwtSecret);
    if (p.typ !== "user") return res.status(401).json({ ok: false, message: "登录身份无效" });
    const user = activeUser(p.uid);
    if (!user) return res.status(401).json({ ok: false, message: "账号已注销" });
    req.userId = user.id;
    req.userRole = user.role;
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "登录已过期" });
  }
}

function optionalUser(req, res, next) {
  const token = bearer(req);
  if (!token) return next();
  try {
    const p = jwt.verify(token, config.jwtSecret);
    if (p.typ === "user" && activeUser(p.uid)) req.userId = p.uid;
  } catch {
    /* ignore */
  }
  next();
}

function activeAdmin(id) {
  if (!id) return null;
  const row = getDb().prepare("SELECT id, role, status FROM admin_users WHERE id=?").get(id);
  if (!row || (row.status || "on") === "off") return null;
  return row;
}

function authAdmin(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ ok: false, message: "请先登录管理后台" });
  try {
    const p = jwt.verify(token, config.jwtSecret);
    if (p.typ !== "admin") return res.status(401).json({ ok: false, message: "需要管理员权限" });
    const admin = activeAdmin(p.aid);
    if (!admin) return res.status(401).json({ ok: false, message: "管理员账号已停用" });
    req.adminId = admin.id;
    req.adminRole = admin.role;
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "管理员登录已过期" });
  }
}

function authGuide(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ ok: false, message: "请先登录导游端" });
  try {
    const p = jwt.verify(token, config.jwtSecret);
    if (p.typ !== "guide") return res.status(401).json({ ok: false, message: "需要导游身份" });
    const guide = getDb().prepare("SELECT * FROM guides WHERE id=?").get(p.gid);
    if (!guide || guide.status === "off") return res.status(401).json({ ok: false, message: "导游账号不可用" });
    req.guideId = guide.id;
    req.guide = guide;
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "导游登录已过期" });
  }
}

function bearer(req) {
  const h = (req.headers && req.headers.authorization) || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  return (req.query && req.query.token) || "";
}

module.exports = { signUser, signAdmin, signGuide, authUser, optionalUser, authAdmin, authGuide };
