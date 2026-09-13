const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginAdmin, issueCaptcha, auth, ID } = require("./http");

describe("guide portal", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("logs in by phone captcha, lists assigned trips and checks in", async () => {
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
    const login = await agent.post("/api/guide/login").send({
      phone: "13700001101",
      captchaToken: cap.token,
      captcha: cap.code,
    }).expect(200);
    const gauth = auth(login.body.data.token);
    const trips = await agent.get("/api/guide/schedules").set(gauth).expect(200);
    assert.ok(trips.body.data.some((s) => s.id === seed.individualScheduleId));

    const detail = await agent.get(`/api/guide/schedules/${seed.individualScheduleId}`).set(gauth).expect(200);
    const first = detail.body.data.roster[0];
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

    const started = await agent.post(`/api/guide/schedules/${seed.individualScheduleId}/start`).set(gauth).expect(200);
    assert.ok(started.body.data.startedAt);
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
});
