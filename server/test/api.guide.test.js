const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const { harness, loginUser, loginAdmin, issueCaptcha, auth, ID } = require("./http");

describe("guide portal", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("requires a phone verification code before opening guide data and checks in", async () => {
    const userToken = await loginUser(agent);
    await agent.post("/api/enroll").set(auth(userToken)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: ID.maleBj,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    });
    await agent.post("/api/enroll").set(auth(userToken)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "陈小川",
      travelerPhone: "13800138001",
      idCard: ID.femaleBj,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    });
    const sch = seed.db.prepare("SELECT * FROM schedules WHERE id=?").get(seed.individualScheduleId);
    assert.equal(sch.guide_id, seed.guideId);

    const cap = await issueCaptcha(agent);
    const sms = await agent.post("/api/auth/sms").send({
      phone: "13700001101",
      scene: "guide",
      captchaToken: cap.token,
      captcha: cap.code,
    }).expect(200);
    assert.equal(sms.body.data.demoCode, "888888");
    await agent.post("/api/guide/login").send({ phone: "13700001101", code: "000000" }).expect(400);
    const login = await agent.post("/api/guide/login").send({
      phone: "13700001101",
      code: "888888",
    }).expect(200);
    const gauth = auth(login.body.data.token);
    const trips = await agent.get("/api/guide/schedules").set(gauth).expect(200);
    assert.ok(trips.body.data.some((s) => s.id === seed.individualScheduleId));

    const detail = await agent.get(`/api/guide/schedules/${seed.individualScheduleId}`).set(gauth).expect(200);
    const first = detail.body.data.roster[0];
    assert.equal(detail.body.data.canStartTrip, false);
    assert.ok(first.phone);
    assert.match(first.phone, /\*\*\*\*/);
    assert.equal(first.phonesVisible, false);
    assert.equal(first.emergencyName, "紧急联系人");
    assert.ok(first.emergencyPhone);
    assert.match(first.emergencyPhone, /\*\*\*\*/);
    assert.ok(first.userId);
    assert.ok(first.hometown);
    const traveler = await agent
      .get(`/api/guide/schedules/${seed.individualScheduleId}/travelers/${first.id}`)
      .set(gauth)
      .expect(200);
    assert.equal(traveler.body.data.phone, first.phone);
    assert.equal(traveler.body.data.phonesVisible, false);
    assert.equal(traveler.body.data.emergencyName, "紧急联系人");
    assert.match(traveler.body.data.idCard, /\*/);
    assert.ok(traveler.body.data.profile);
    assert.equal(traveler.body.data.profile.id, first.userId);
    assert.ok(!("isVirtual" in traveler.body.data));
    await agent.get(`/api/guide/schedules/${seed.individualScheduleId}/travelers/${first.id}`).expect(401);
    await agent
      .get(`/api/guide/schedules/${seed.individualScheduleId}/travelers/999999`)
      .set(gauth)
      .expect(404);

    const checked = await agent
      .post(`/api/guide/schedules/${seed.individualScheduleId}/checkin`)
      .set(gauth)
      .send({ enrollmentId: first.id })
      .expect(200);
    assert.ok(checked.body.data.checkinAt);

    await agent.post(`/api/guide/schedules/${seed.individualScheduleId}/start`).set(gauth).expect(400);
    const beforeStart = await agent.get(`/api/guide/schedules/${seed.individualScheduleId}`).set(gauth).expect(200);
    assert.equal(beforeStart.body.data.roster.some((r) => r.phonesVisible), false);
    const chinaToday = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    seed.db.prepare("UPDATE schedules SET start_date=? WHERE id=?").run(chinaToday, seed.individualScheduleId);
    const ready = await agent.get(`/api/guide/schedules/${seed.individualScheduleId}`).set(gauth).expect(200);
    assert.equal(ready.body.data.canStartTrip, true);
    const started = await agent.post(`/api/guide/schedules/${seed.individualScheduleId}/start`).set(gauth).expect(200);
    assert.ok(started.body.data.startedAt);
    assert.equal(started.body.data.canStartTrip, false);
    const openedPhone = (started.body.data.roster || []).find((r) => r.id === first.id);
    assert.ok(openedPhone);
    assert.match(openedPhone.phone, /^1\d{10}$/);
    assert.equal(openedPhone.phonesVisible, true);
    const startedAgain = await agent.post(`/api/guide/schedules/${seed.individualScheduleId}/start`).set(gauth).expect(200);
    assert.equal(startedAgain.body.data.already, true);

    const opened = await agent
      .post(`/api/guide/schedules/${seed.individualScheduleId}/checkins`)
      .set(gauth)
      .send({ stopKey: "depart" })
      .expect(200);
    assert.equal(opened.body.data.checkin.openSession.title, "出发前上车");
    const againOpen = await agent
      .post(`/api/guide/schedules/${seed.individualScheduleId}/checkins`)
      .set(gauth)
      .send({ stopKey: "depart" });
    assert.equal(againOpen.status, 400);

    const marked = await agent
      .post(`/api/guide/schedules/${seed.individualScheduleId}/checkin`)
      .set(gauth)
      .send({ enrollmentId: first.id })
      .expect(200);
    assert.ok(marked.body.data.sessionId);
    const round = await agent.get(`/api/guide/schedules/${seed.individualScheduleId}`).set(gauth).expect(200);
    assert.equal(round.body.data.roster.find((r) => r.id === first.id).sessionChecked, true);

    const sessionId = round.body.data.checkin.openSession.id;
    const confirmed = await agent
      .post(`/api/guide/schedules/${seed.individualScheduleId}/checkins/${sessionId}/confirm`)
      .set(gauth)
      .expect(200);
    assert.equal(confirmed.body.data.checkin.openSession, null);
    assert.equal(confirmed.body.data.checkin.sessions[0].status, "confirmed");

    const stopRound = await agent
      .post(`/api/guide/schedules/${seed.individualScheduleId}/checkins`)
      .set(gauth)
      .send({ stopKey: "stop-0" })
      .expect(200);
    assert.match(stopRound.body.data.checkin.openSession.title, /出发/);

    const admin = await loginAdmin(agent);
    const adminView = await agent
      .get(`/api/admin/schedules/${seed.individualScheduleId}/checkin`)
      .set(auth(admin))
      .expect(200);
    assert.ok(adminView.body.data.checkin.openSession);
    await agent
      .post(`/api/admin/schedules/${seed.individualScheduleId}/checkins/${adminView.body.data.checkin.openSession.id}/confirm`)
      .set(auth(admin))
      .expect(200);

    const user = await agent.get("/api/guide/me").set(auth(userToken));
    assert.equal(user.status, 401);
  });

  it("closes the assigned trip once for every joined traveler", async () => {
    const userToken = await loginUser(agent);
    await agent.post("/api/enroll").set(auth(userToken)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: ID.maleBj,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    });
    const cap = await issueCaptcha(agent);
    await agent.post("/api/auth/sms").send({
      phone: "13700001101",
      scene: "guide",
      captchaToken: cap.token,
      captcha: cap.code,
    }).expect(200);
    const login = await agent.post("/api/guide/login").send({ phone: "13700001101", code: "888888" }).expect(200);
    const gauth = auth(login.body.data.token);
    seed.db.prepare("UPDATE schedules SET guide_id=?, start_date=?, end_date=? WHERE id=?").run(
      seed.guideId,
      dayjs().format("YYYY-MM-DD"),
      dayjs().format("YYYY-MM-DD"),
      seed.individualScheduleId
    );
    const done = await agent.post(`/api/guide/schedules/${seed.individualScheduleId}/complete`).set(gauth).expect(200);
    assert.equal(done.body.data.already, false);
    assert.ok(done.body.data.count >= 1);
    const row = seed.db.prepare("SELECT completed_at FROM enrollments WHERE user_id=? AND schedule_id=?").get(seed.userId, seed.individualScheduleId);
    assert.ok(row.completed_at);
    const again = await agent.post(`/api/guide/schedules/${seed.individualScheduleId}/complete`).set(gauth).expect(200);
    assert.equal(again.body.data.already, true);
  });
});
