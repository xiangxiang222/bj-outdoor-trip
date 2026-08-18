const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginAdmin, loginUser, issueCaptcha, auth, ID } = require("./http");

describe("admin staff and user ops", () => {
  let agent;
  let seed;
  let adminToken;

  beforeEach(async () => {
    ({ agent, seed } = harness());
    adminToken = await loginAdmin(agent);
  });

  it("returns current admin profile and lists staff", async () => {
    const me = await agent.get("/api/admin/me").set(auth(adminToken)).expect(200);
    assert.equal(me.body.data.username, "admin");
    assert.equal(me.body.data.role, "admin");
    assert.equal(me.body.data.status, "on");
    assert.equal(me.body.data.password_hash, undefined);
    const list = await agent.get("/api/admin/staff").set(auth(adminToken)).expect(200);
    assert.equal(list.body.data.length, 1);
  });

  it("creates operator, forbids staff APIs, then admin can update disable and delete", async () => {
    const created = await agent
      .post("/api/admin/staff")
      .set(auth(adminToken))
      .send({ username: "ops_one", name: "运营甲", password: "ops123456", role: "operator" })
      .expect(200);
    assert.equal(created.body.data.role, "operator");

    const dup = await agent
      .post("/api/admin/staff")
      .set(auth(adminToken))
      .send({ username: "ops_one", name: "重复", password: "ops123456", role: "operator" });
    assert.equal(dup.status, 400);

    const badName = await agent
      .post("/api/admin/staff")
      .set(auth(adminToken))
      .send({ username: "1ops", name: "错误", password: "ops123456" });
    assert.equal(badName.status, 400);

    const opLogin = await agent
      .post("/api/admin/login")
      .send({ username: "ops_one", password: "ops123456" })
      .expect(200);
    const opToken = opLogin.body.data.token;
    await agent.get("/api/admin/staff").set(auth(opToken)).expect(403);
    await agent.post("/api/admin/staff").set(auth(opToken)).send({ username: "x", name: "x", password: "123456" }).expect(403);

    const renamed = await agent
      .put(`/api/admin/staff/${created.body.data.id}`)
      .set(auth(adminToken))
      .send({ name: "运营乙" })
      .expect(200);
    assert.equal(renamed.body.data.name, "运营乙");

    await agent.put(`/api/admin/staff/${created.body.data.id}`).set(auth(adminToken)).send({ status: "off" }).expect(200);
    const offLogin = await agent.post("/api/admin/login").send({ username: "ops_one", password: "ops123456" });
    assert.equal(offLogin.status, 400);
    assert.match(offLogin.body.message, /停用/);

    await agent.delete(`/api/admin/staff/${created.body.data.id}`).set(auth(adminToken)).expect(200);
    const gone = await agent.get("/api/admin/staff").set(auth(adminToken)).expect(200);
    assert.equal(gone.body.data.length, 1);
  });

  it("rejects deleting or disabling the last admin and self", async () => {
    const me = await agent.get("/api/admin/me").set(auth(adminToken)).expect(200);
    const id = me.body.data.id;
    const delSelf = await agent.delete(`/api/admin/staff/${id}`).set(auth(adminToken));
    assert.equal(delSelf.status, 400);
    const offSelf = await agent.put(`/api/admin/staff/${id}`).set(auth(adminToken)).send({ status: "off" });
    assert.equal(offSelf.status, 400);
    const demote = await agent.put(`/api/admin/staff/${id}`).set(auth(adminToken)).send({ role: "operator" });
    assert.equal(demote.status, 400);
  });

  it("changes own password and rejects wrong old password", async () => {
    await agent.put("/api/admin/me/password").set(auth(adminToken)).send({ oldPassword: "nope", newPassword: "newpass1" }).expect(400);
    await agent
      .put("/api/admin/me/password")
      .set(auth(adminToken))
      .send({ oldPassword: "admin123", newPassword: "admin456" })
      .expect(200);
    await agent.post("/api/admin/login").send({ username: "admin", password: "admin123" }).expect(400);
    await agent.post("/api/admin/login").send({ username: "admin", password: "admin456" }).expect(200);
  });

  it("searches users, grants and revokes membership, adjusts points, closes account", async () => {
    const listed = await agent.get("/api/admin/users?q=林北野").set(auth(adminToken)).expect(200);
    assert.ok(listed.body.data.some((u) => u.phone === "13800138000"));
    assert.equal(listed.body.data[0].isMember, true);

    const cap = await issueCaptcha(agent);
    const created = await agent
      .post("/api/auth/register")
      .send({
        phone: "13600136009",
        password: "123456",
        nickname: "后台操作用户",
        captchaToken: cap.token,
        captcha: cap.code,
      })
      .expect(200);
    const userId = created.body.data.user.id;
    const plus = await agent
      .post(`/api/admin/users/${userId}/points`)
      .set(auth(adminToken))
      .send({ delta: 20, reason: "客服补发" })
      .expect(200);
    assert.equal(plus.body.data.points, 20);
    await agent.post(`/api/admin/users/${userId}/points`).set(auth(adminToken)).send({ delta: -50, reason: "扣多了" }).expect(400);
    await agent.post(`/api/admin/users/${userId}/points`).set(auth(adminToken)).send({ delta: 1 }).expect(400);

    const grant = await agent.post(`/api/admin/users/${userId}/member`).set(auth(adminToken)).send({ action: "grant" }).expect(200);
    assert.equal(grant.body.data.isMember, true);
    const revoke = await agent.post(`/api/admin/users/${userId}/member`).set(auth(adminToken)).send({ action: "revoke" }).expect(200);
    assert.equal(revoke.body.data.isMember, false);

    await agent.post(`/api/admin/users/${userId}/close`).set(auth(adminToken)).expect(200);
    const after = await agent.get("/api/admin/users?q=后台操作用户").set(auth(adminToken)).expect(200);
    assert.equal(after.body.data.length, 0);
  });

  it("admin can cancel another user's enrollment", async () => {
    const token = await loginUser(agent);
    const enrolled = await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "后台取消",
      travelerPhone: "13800138000",
      idCard: ID.maleHb,
    });
    const id = enrolled.body.data.enrollmentId;
    const filtered = await agent.get("/api/admin/enrollments?q=后台取消&status=joined").set(auth(adminToken)).expect(200);
    assert.equal(filtered.body.data.length, 1);
    const cancelled = await agent.post(`/api/admin/enrollments/${id}/cancel`).set(auth(adminToken)).expect(200);
    assert.equal(cancelled.body.data.status, "cancelled");
    await agent.post(`/api/admin/enrollments/${id}/cancel`).set(auth(adminToken)).expect(400);
  });
});
