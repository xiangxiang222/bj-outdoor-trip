const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, issueCaptcha, auth, ID } = require("./http");

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
    assert.equal(first.emergencyName, "紧急联系人");
    assert.ok(first.emergencyPhone);
    assert.ok(first.userId);
    assert.ok(first.hometown);
    const traveler = await agent
      .get(`/api/guide/schedules/${seed.individualScheduleId}/travelers/${first.id}`)
      .set(gauth)
      .expect(200);
    assert.equal(traveler.body.data.phone, first.phone);
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

    const user = await agent.get("/api/guide/me").set(auth(userToken));
    assert.equal(user.status, 401);
  });
});
