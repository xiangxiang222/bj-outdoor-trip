const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { signUser, signAdmin, authUser, optionalUser, authAdmin } = require("../src/middleware/auth");
const config = require("../src/config");
const { seedMinimal } = require("./helpers");

function resMock() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("jwt sign", () => {
  it("signs user and admin tokens with distinct typ", () => {
    const u = jwt.verify(signUser({ id: 7, role: "company" }), config.jwtSecret);
    assert.equal(u.uid, 7);
    assert.equal(u.typ, "user");
    assert.equal(u.role, "company");
    const a = jwt.verify(signAdmin({ id: 1, role: "admin" }), config.jwtSecret);
    assert.equal(a.aid, 1);
    assert.equal(a.typ, "admin");
  });
});

describe("authUser", () => {
  let seed;
  beforeEach(() => {
    seed = seedMinimal();
  });

  it("rejects missing token", () => {
    const res = resMock();
    authUser({ headers: {} }, res, () => assert.fail("should not next"));
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, "请先登录");
  });

  it("rejects admin token on user routes", () => {
    const res = resMock();
    const token = signAdmin({ id: 1, role: "admin" });
    authUser({ headers: { authorization: `Bearer ${token}` } }, res, () => assert.fail());
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, "登录身份无效");
  });

  it("rejects expired token", () => {
    const res = resMock();
    const token = jwt.sign({ uid: 1, typ: "user" }, config.jwtSecret, { expiresIn: -1 });
    authUser({ headers: { authorization: `Bearer ${token}` } }, res, () => assert.fail());
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, "登录已过期");
  });

  it("accepts query token and sets userId", () => {
    const token = signUser({ id: seed.userId, role: "user" });
    const req = { headers: {}, query: { token } };
    let called = false;
    authUser(req, resMock(), () => {
      called = true;
    });
    assert.equal(called, true);
    assert.equal(req.userId, seed.userId);
  });

  it("rejects deleted account token", () => {
    seed.db.prepare("UPDATE users SET deleted_at=datetime('now') WHERE id=?").run(seed.userId);
    const res = resMock();
    const token = signUser({ id: seed.userId, role: "user" });
    authUser({ headers: { authorization: `Bearer ${token}` } }, res, () => assert.fail());
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, "账号已注销");
  });
});

describe("optionalUser", () => {
  let seed;
  beforeEach(() => {
    seed = seedMinimal();
  });

  it("continues without token", () => {
    let called = false;
    optionalUser({ headers: {}, query: {} }, resMock(), () => {
      called = true;
    });
    assert.equal(called, true);
  });

  it("ignores bad token", () => {
    const req = { headers: { authorization: "Bearer not-a-jwt" }, query: {} };
    optionalUser(req, resMock(), () => {});
    assert.equal(req.userId, undefined);
  });

  it("sets userId for valid user token", () => {
    const req = { headers: { authorization: `Bearer ${signUser({ id: seed.userId })}` }, query: {} };
    optionalUser(req, resMock(), () => {});
    assert.equal(req.userId, seed.userId);
  });
});

describe("authAdmin", () => {
  let seed;
  beforeEach(() => {
    seed = seedMinimal();
  });

  it("rejects missing and user tokens", () => {
    const missing = resMock();
    authAdmin({ headers: {}, query: {} }, missing, () => assert.fail());
    assert.equal(missing.body.message, "请先登录管理后台");
    const wrong = resMock();
    authAdmin({ headers: { authorization: `Bearer ${signUser({ id: 1 })}` } }, wrong, () => assert.fail());
    assert.equal(wrong.body.message, "需要管理员权限");
  });

  it("rejects expired admin token", () => {
    const res = resMock();
    const token = jwt.sign({ aid: seed.adminId, typ: "admin" }, config.jwtSecret, { expiresIn: -1 });
    authAdmin({ headers: { authorization: `Bearer ${token}` }, query: {} }, res, () => assert.fail());
    assert.equal(res.body.message, "管理员登录已过期");
  });

  it("accepts admin token", () => {
    const req = { headers: { authorization: `Bearer ${signAdmin({ id: seed.adminId, role: "admin" })}` }, query: {} };
    authAdmin(req, resMock(), () => {});
    assert.equal(req.adminId, seed.adminId);
    assert.equal(req.adminRole, "admin");
  });

  it("rejects disabled admin token", () => {
    seed.db.prepare("UPDATE admin_users SET status='off' WHERE id=?").run(seed.adminId);
    const res = resMock();
    const token = signAdmin({ id: seed.adminId, role: "admin" });
    authAdmin({ headers: { authorization: `Bearer ${token}` }, query: {} }, res, () => assert.fail());
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, "管理员账号已停用");
  });
});
