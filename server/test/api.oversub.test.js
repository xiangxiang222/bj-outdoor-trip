const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginAdmin, auth, ID, issueCaptcha, enrollPayload, campusPayload } = require("./http");
const { makeIdCard } = require("../src/services/idcard");

const EXTRA_IDS = [
  makeIdCard("110101", "19910315", "1", "11"),
  makeIdCard("110101", "19920416", "2", "12"),
  makeIdCard("110101", "19930517", "1", "13"),
  makeIdCard("110101", "19940618", "2", "14"),
];

describe("oversub draw and campus alumni", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  async function registerPhone(phone, nick) {
    const cap = await issueCaptcha(agent);
    const res = await agent
      .post("/api/auth/register")
      .send({
        phone,
        password: "123456",
        nickname: nick,
        captchaToken: cap.token,
        captcha: cap.code,
      })
      .expect(200);
    const id = seed.db.prepare("SELECT id FROM users WHERE phone=?").get(phone).id;
    return { token: res.body.data.token, id };
  }

  async function certify(token, userId, school, campusKind = "student") {
    await agent.post("/api/me/student").set(auth(token)).send(campusPayload({ school, campusKind })).expect(200);
    const admin = await loginAdmin(agent);
    await agent
      .post(`/api/admin/users/${userId}/verify`)
      .set(auth(admin))
      .send({ kind: "student", action: "approve" })
      .expect(200);
  }

  function enroll(token, extra = {}) {
    return agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: extra.scheduleId || seed.individualScheduleId,
      travelerName: extra.travelerName || "报名同学",
      travelerPhone: extra.travelerPhone || "13800138000",
      idCard: extra.idCard || ID.maleBj,
      ...enrollPayload(extra),
    });
  }

  it("confirms everyone when applicants do not exceed seats", async () => {
    const admin = await loginAdmin(agent);
    const saved = await agent
      .put(`/api/admin/schedules/${seed.individualScheduleId}/limit`)
      .set(auth(admin))
      .send({ oversub: true })
      .expect(200);
    assert.equal(saved.body.data.oversub.enabled, true);
    assert.equal(saved.body.data.oversub.pending, true);
    assert.equal(saved.body.data.oversub.label, "报超会抽");
    assert.match(saved.body.data.oversub.copy, /未超过则全部确认/);

    const token = await loginUser(agent);
    const first = await enroll(token).expect(200);
    assert.equal(first.body.data.status, "applied");
    assert.match(first.body.data.message, /若报名超过座位将抽签/);

    const trips = await agent.get("/api/me/trips").set(auth(token)).expect(200);
    assert.equal(trips.body.data[0].status, "applied");

    const other = await registerPhone("13600136001", "第二人");
    const second = await enroll(other.token, {
      travelerName: "第二人",
      travelerPhone: "13600136001",
      idCard: EXTRA_IDS[0],
    }).expect(200);
    assert.equal(second.body.data.status, "applied");

    const detail = await agent.get(`/api/schedules/${seed.individualScheduleId}`).set(auth(token)).expect(200);
    assert.equal(detail.body.data.oversub.applied, 2);
    assert.equal(detail.body.data.myEnrollment.status, "applied");
    assert.equal(detail.body.data.enrolled, 0);

    const drawn = await agent
      .post(`/api/admin/schedules/${seed.individualScheduleId}/draw`)
      .set(auth(admin))
      .expect(200);
    assert.equal(drawn.body.data.over, false);
    assert.equal(drawn.body.data.winnerCount, 2);
    assert.equal(drawn.body.data.waitlistCount, 0);

    const after = await agent.get(`/api/schedules/${seed.individualScheduleId}`).set(auth(token)).expect(200);
    assert.equal(after.body.data.oversub.drawn, true);
    assert.equal(after.body.data.oversub.over, false);
    assert.equal(after.body.data.oversub.label, "已全员确认");
    assert.equal(after.body.data.enrolled, 2);
    assert.equal(after.body.data.myEnrollment.status, "joined");

    const again = await agent.post(`/api/admin/schedules/${seed.individualScheduleId}/draw`).set(auth(admin));
    assert.equal(again.status, 400);
    assert.match(again.body.message, /已确认/);
  });

  it("draws when applicants exceed seats and promotes waitlist after a cancel", async () => {
    const admin = await loginAdmin(agent);
    seed.db.prepare("UPDATE schedules SET max_seats=3 WHERE id=?").run(seed.individualScheduleId);
    await agent
      .put(`/api/admin/schedules/${seed.individualScheduleId}/limit`)
      .set(auth(admin))
      .send({ oversub: true })
      .expect(200);

    const users = [
      { token: await loginUser(agent), phone: "13800138000", name: "林北野", idCard: ID.maleBj },
    ];
    const extras = [
      ["13600136001", "甲", EXTRA_IDS[0]],
      ["13600136002", "乙", EXTRA_IDS[1]],
      ["13600136003", "丙", EXTRA_IDS[2]],
      ["13600136004", "丁", EXTRA_IDS[3]],
    ];
    for (const [phone, name, idCard] of extras) {
      const row = await registerPhone(phone, name);
      users.push({ token: row.token, phone, name, idCard });
    }
    for (const u of users) {
      const res = await enroll(u.token, {
        travelerName: u.name,
        travelerPhone: u.phone,
        idCard: u.idCard,
      }).expect(200);
      assert.equal(res.body.data.status, "applied");
    }

    const drawn = await agent
      .post(`/api/admin/schedules/${seed.individualScheduleId}/draw`)
      .set(auth(admin))
      .expect(200);
    assert.equal(drawn.body.data.over, true);
    assert.equal(drawn.body.data.winnerCount, 3);
    assert.equal(drawn.body.data.waitlistCount, 2);

    const after = await agent.get(`/api/schedules/${seed.individualScheduleId}`).expect(200);
    assert.equal(after.body.data.oversub.over, true);
    assert.equal(after.body.data.oversub.label, "已抽签");
    assert.equal(after.body.data.enrolled, 3);
    assert.equal(after.body.data.waitlistCount, 2);

    const winner = seed.db
      .prepare("SELECT * FROM enrollments WHERE schedule_id=? AND status='joined' ORDER BY draw_rank LIMIT 1")
      .get(seed.individualScheduleId);
    const nextWait = seed.db
      .prepare("SELECT * FROM enrollments WHERE schedule_id=? AND status='waitlist' ORDER BY draw_rank, id LIMIT 1")
      .get(seed.individualScheduleId);
    await agent.post(`/api/admin/enrollments/${winner.id}/cancel`).set(auth(admin)).expect(200);
    const promoted = seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(nextWait.id);
    assert.equal(promoted.status, "joined");
    assert.equal(
      seed.db.prepare("SELECT COUNT(*) AS c FROM enrollments WHERE schedule_id=? AND status='joined'").get(seed.individualScheduleId).c,
      3
    );
  });

  it("lets approved alumni join only when the trip allows alumni", async () => {
    const admin = await loginAdmin(agent);
    await agent
      .put(`/api/admin/schedules/${seed.individualScheduleId}/limit`)
      .set(auth(admin))
      .send({ studentOnly: true, schools: ["北京大学"] })
      .expect(200);

    const token = await loginUser(agent);
    await certify(token, seed.userId, "北京大学", "alumni");
    const me = await agent.get("/api/me").set(auth(token)).expect(200);
    assert.equal(me.body.data.isAlumni, true);
    assert.equal(me.body.data.isStudent, false);
    assert.equal(me.body.data.campusKind, "alumni");

    const denied = await enroll(token);
    assert.equal(denied.status, 400);
    assert.match(denied.body.message, /已认证学生/);

    const opened = await agent
      .put(`/api/admin/schedules/${seed.individualScheduleId}/limit`)
      .set(auth(admin))
      .send({ studentOnly: true, alumniOk: true, oversub: true, schools: ["北京大学"] })
      .expect(200);
    assert.equal(opened.body.data.eligibility.alumniOk, true);
    assert.equal(opened.body.data.eligibility.label, "仅限北京大学师生校友");

    const ok = await enroll(token).expect(200);
    assert.equal(ok.body.data.status, "applied");
    const quote = await agent.get(`/api/schedules/${seed.individualScheduleId}`).set(auth(token)).expect(200);
    assert.equal(quote.body.data.quote.isStudent, false);
  });

  it("keeps volunteer leaders out of the pending draw pool", async () => {
    const admin = await loginAdmin(agent);
    await agent
      .put(`/api/admin/schedules/${seed.individualScheduleId}/limit`)
      .set(auth(admin))
      .send({ oversub: true })
      .expect(200);
    const token = await loginUser(agent);
    const res = await enroll(token, { joinMode: "assistant" }).expect(200);
    assert.equal(res.body.data.status, "joined");
    const detail = await agent.get(`/api/schedules/${seed.individualScheduleId}`).expect(200);
    assert.equal(detail.body.data.enrolled, 1);
    assert.equal(detail.body.data.oversub.applied, 0);
  });

  it("persists oversub and alumni flags when admin publishes", async () => {
    const admin = await loginAdmin(agent);
    const routes = await agent.get("/api/admin/routes").set(auth(admin)).expect(200);
    const buses = await agent.get("/api/buses").expect(200);
    const created = await agent
      .post("/api/admin/schedules")
      .set(auth(admin))
      .send({
        routeId: routes.body.data[0].id,
        startDate: seed.db.prepare("SELECT date('now','+9 day') AS d").get().d,
        busTypeId: buses.body.data[0].id,
        studentOnly: true,
        alumniOk: true,
        oversub: true,
        schools: ["北京林业大学"],
      })
      .expect(200);
    assert.equal(created.body.data.oversub.enabled, true);
    assert.equal(created.body.data.eligibility.alumniOk, true);
    assert.deepEqual(created.body.data.eligibility.schools, ["北京林业大学"]);
  });

  it("turns on draw for a free campus trip and uses the school name", async () => {
    const admin = await loginAdmin(agent);
    const routes = await agent.get("/api/admin/routes").set(auth(admin)).expect(200);
    const buses = await agent.get("/api/buses").expect(200);
    const created = await agent
      .post("/api/admin/schedules")
      .set(auth(admin))
      .send({
        routeId: routes.body.data[0].id,
        startDate: seed.db.prepare("SELECT date('now','+11 day') AS d").get().d,
        busTypeId: buses.body.data[0].id,
        organizerType: "campus",
        companyName: "北京大学",
        offerType: "free",
        meetupPoint: "东直门东方银座C口",
      })
      .expect(200);
    assert.equal(created.body.data.organizerType, "campus");
    assert.equal(created.body.data.offerType, "free");
    assert.equal(created.body.data.oversub.enabled, true);
    assert.equal(created.body.data.eligibility.studentOnly, true);
    assert.deepEqual(created.body.data.eligibility.schools, ["北京大学"]);

    const token = await loginUser(agent);
    await certify(token, seed.userId, "北京大学");
    const applied = await enroll(token, { scheduleId: created.body.data.id }).expect(200);
    assert.equal(applied.body.data.status, "applied");
  });
});
