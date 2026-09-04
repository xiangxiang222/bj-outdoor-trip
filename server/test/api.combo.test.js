const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginAdmin, auth, ID, issueCaptcha } = require("./http");

describe("combo groups", () => {
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

  it("blocks opening a combo trip unless the user is a student or student org", async () => {
    const token = await loginUser(agent);
    const buses = await agent.get("/api/buses").expect(200);
    const denied = await agent.post("/api/trips").set(auth(token)).send({
      title: "学生组合团",
      startDate: seed.db.prepare("SELECT date('now','+5 day') AS d").get().d,
      busTypeId: buses.body.data[0].id,
      offerType: "combo",
      originPrice: 199,
      minGroupSize: 2,
    });
    assert.equal(denied.status, 400);
    assert.match(denied.body.message, /学生/);
  });

  it("lets approved students enroll and list partner conditions", async () => {
    const token = await loginUser(agent);
    seed.db
      .prepare("UPDATE schedules SET offer_type='combo', combo_rule_json=? WHERE id=?")
      .run(JSON.stringify({ require: "student_or_group", school: "北京" }), seed.individualScheduleId);
    const blocked = await enroll(token);
    assert.equal(blocked.status, 400);

    await approveStudent(token, seed.userId, "北京大学");
    const ok = await enroll(token, {
      wantGender: "female",
      wantSchool: "清华大学",
      comboNote: "想找第一次走长城的同伴",
    }).expect(200);
    assert.ok(ok.body.data.enrollmentId);

    const detail = await agent.get(`/api/schedules/${seed.individualScheduleId}`).set(auth(token)).expect(200);
    assert.equal(detail.body.data.combo.enabled, true);
    assert.equal(detail.body.data.combo.canJoin, true);
    assert.equal(detail.body.data.combo.mates.length, 1);
    assert.equal(detail.body.data.combo.mates[0].wantGender, "female");
    assert.equal(detail.body.data.combo.mates[0].wantSchool, "清华大学");
    assert.match(detail.body.data.combo.mates[0].note, /长城/);

    const cap = await issueCaptcha(agent);
    const other = await agent
      .post("/api/auth/register")
      .send({
        phone: "13600136007",
        password: "123456",
        nickname: "外校生",
        captchaToken: cap.token,
        captcha: cap.code,
      })
      .expect(200);
    const otherToken = other.body.data.token;
    const otherId = seed.db.prepare("SELECT id FROM users WHERE phone=?").get("13600136007").id;
    await approveStudent(otherToken, otherId, "复旦大学");
    const schoolDenied = await enroll(otherToken, {
      travelerName: "外校生",
      travelerPhone: "13600136007",
      idCard: ID.femaleBj,
    });
    assert.equal(schoolDenied.status, 400);
    assert.match(schoolDenied.body.message, /北京/);
  });
});
