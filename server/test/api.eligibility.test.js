const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginAdmin, auth, ID, issueCaptcha } = require("./http");

describe("student and school enroll limits", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  async function approveStudent(token, userId, school) {
    await agent.post("/api/me/student").set(auth(token)).send({ school }).expect(200);
    const admin = await loginAdmin(agent);
    await agent.post(`/api/admin/users/${userId}/verify`).set(auth(admin)).send({ kind: "student", action: "approve" }).expect(200);
  }

  function enroll(token, extra = {}) {
    return agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: seed.individualScheduleId,
        travelerName: extra.travelerName || "林北野",
        travelerPhone: extra.travelerPhone || "13800138000",
        idCard: extra.idCard || ID.maleBj,
        emergencyName: "紧急联系人",
        emergencyPhone: "13700000002",
        waiverAccepted: true,
        healthOk: true,
        ...extra,
      });
  }

  it("blocks non-students when the trip is student-only", async () => {
    const admin = await loginAdmin(agent);
    await agent
      .put(`/api/admin/schedules/${seed.individualScheduleId}/limit`)
      .set(auth(admin))
      .send({ studentOnly: true })
      .expect(200);

    const token = await loginUser(agent);
    const blocked = await enroll(token);
    assert.equal(blocked.status, 400);
    assert.match(blocked.body.message, /已认证学生/);

    const anon = await agent.get(`/api/schedules/${seed.individualScheduleId}`).expect(200);
    assert.equal(anon.body.data.eligibility.studentOnly, true);
    assert.equal(anon.body.data.eligibility.canEnroll, false);
    assert.equal(anon.body.data.eligibility.label, "仅学生");

    await approveStudent(token, seed.userId, "北京大学");
    const ok = await enroll(token).expect(200);
    assert.ok(ok.body.data.enrollmentId);

    const mine = await agent.get(`/api/schedules/${seed.individualScheduleId}`).set(auth(token)).expect(200);
    assert.equal(mine.body.data.eligibility.canEnroll, true);
  });

  it("restricts enrollment to listed schools", async () => {
    const admin = await loginAdmin(agent);
    const saved = await agent
      .put(`/api/admin/schedules/${seed.individualScheduleId}/limit`)
      .set(auth(admin))
      .send({ schools: "北京大学,清华大学" })
      .expect(200);
    assert.deepEqual(saved.body.data.eligibility.schools, ["北京大学", "清华大学"]);
    assert.equal(saved.body.data.eligibility.studentOnly, true);
    assert.equal(saved.body.data.eligibility.label, "仅限北京大学、清华大学");

    const token = await loginUser(agent);
    await approveStudent(token, seed.userId, "复旦大学");
    const denied = await enroll(token);
    assert.equal(denied.status, 400);
    assert.match(denied.body.message, /北京大学/);

    seed.db.prepare("UPDATE users SET school=? WHERE id=?").run("北京大学医学部", seed.userId);
    const ok = await enroll(token).expect(200);
    assert.ok(ok.body.data.enrollmentId);
  });

  it("persists limits when admin publishes a trip", async () => {
    const admin = await loginAdmin(agent);
    const routes = await agent.get("/api/admin/routes").set(auth(admin)).expect(200);
    const buses = await agent.get("/api/buses").expect(200);
    const created = await agent
      .post("/api/admin/schedules")
      .set(auth(admin))
      .send({
        routeId: routes.body.data[0].id,
        startDate: seed.db.prepare("SELECT date('now','+8 day') AS d").get().d,
        busTypeId: buses.body.data[0].id,
        studentOnly: true,
        schools: ["北京林业大学"],
      })
      .expect(200);
    assert.equal(created.body.data.eligibility.studentOnly, true);
    assert.deepEqual(created.body.data.eligibility.schools, ["北京林业大学"]);
  });

  it("keeps combo rule when a user publishes a limited trip", async () => {
    const token = await loginUser(agent);
    await approveStudent(token, seed.userId, "北京大学");
    const buses = await agent.get("/api/buses").expect(200);
    const created = await agent
      .post("/api/trips")
      .set(auth(token))
      .send({
        title: "高校专属组合团",
        startDate: seed.db.prepare("SELECT date('now','+6 day') AS d").get().d,
        busTypeId: buses.body.data[0].id,
        offerType: "combo",
        originPrice: 199,
        minGroupSize: 2,
        comboRule: { require: "student", school: "北京大学" },
        studentOnly: true,
        schools: "北京大学,清华大学",
      })
      .expect(200);
    assert.equal(created.body.data.combo.enabled, true);
    assert.equal(created.body.data.combo.rule.require, "student");
    assert.equal(created.body.data.combo.rule.school, "北京大学");
    assert.deepEqual(created.body.data.eligibility.schools, ["北京大学", "清华大学"]);
  });

  it("blocks volunteer leaders who do not meet the school limit", async () => {
    const admin = await loginAdmin(agent);
    await agent
      .put(`/api/admin/schedules/${seed.individualScheduleId}/limit`)
      .set(auth(admin))
      .send({ studentOnly: true, schools: ["清华大学"] })
      .expect(200);
    const token = await loginUser(agent);
    const denied = await agent.post(`/api/schedules/${seed.individualScheduleId}/leaders/apply`).set(auth(token)).send({});
    assert.equal(denied.status, 400);
    assert.match(denied.body.message, /清华大学/);
  });

  it("lets a second student from another campus be rejected independently", async () => {
    const admin = await loginAdmin(agent);
    await agent
      .put(`/api/admin/schedules/${seed.individualScheduleId}/limit`)
      .set(auth(admin))
      .send({ schools: ["北京大学"] })
      .expect(200);

    const cap = await issueCaptcha(agent);
    const other = await agent
      .post("/api/auth/register")
      .send({
        phone: "13600136008",
        password: "123456",
        nickname: "外校生",
        captchaToken: cap.token,
        captcha: cap.code,
      })
      .expect(200);
    const otherToken = other.body.data.token;
    const otherId = seed.db.prepare("SELECT id FROM users WHERE phone=?").get("13600136008").id;
    await approveStudent(otherToken, otherId, "中山大学");
    const denied = await enroll(otherToken, {
      travelerName: "外校生",
      travelerPhone: "13600136008",
      idCard: ID.femaleBj,
    });
    assert.equal(denied.status, 400);
    assert.match(denied.body.message, /北京大学/);
  });
});
