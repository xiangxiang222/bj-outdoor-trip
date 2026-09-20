const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const { harness, loginUser, loginAdmin, loginCompany, auth, ID, enrollPayload } = require("./http");
const { getDb } = require("../src/db");
const { mockOpenid } = require("../src/services/wechat");
const { mergeDueTrips } = require("../src/services/official-trip");
const { virtualEnrolledCount, realEnrolledCount } = require("../src/services/helpers");
const config = require("../src/config");

describe("virtual auto heat API", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("turns auto heat on for official and user-created trips, off for private and activity", async () => {
    const token = await loginUser(agent);
    const admin = await loginAdmin(agent);
    const start = dayjs().add(12, "day").format("YYYY-MM-DD");
    const official = await agent
      .post("/api/admin/schedules")
      .set(auth(admin))
      .send({
        routeId: seed.routeId,
        startDate: start,
        busTypeId: "bus30",
        minGroupSize: 10,
        meetupPoint: "东直门东方银座C口",
        meetupTime: "07:30",
        organizerType: "official",
      })
      .expect(200);
    assert.equal(official.body.data.heatMode, "auto");

    const personal = await agent
      .post("/api/schedules")
      .set(auth(token))
      .send({
        routeId: seed.routeId,
        startDate: start,
        busTypeId: "coaster10",
        minGroupSize: 10,
        meetupPoint: "东直门东方银座C口",
        meetupTime: "07:30",
      })
      .expect(200);
    const personalRow = getDb().prepare("SELECT heat_mode FROM schedules WHERE id=?").get(personal.body.data.id);
    assert.equal(personalRow.heat_mode, "auto");

    const priv = await agent
      .post("/api/schedules")
      .set(auth(token))
      .send({
        routeId: seed.routeId,
        startDate: dayjs().add(13, "day").format("YYYY-MM-DD"),
        busTypeId: "coaster10",
        minGroupSize: 10,
        meetupPoint: "东直门东方银座C口",
        meetupTime: "07:30",
        privateJoin: true,
      })
      .expect(200);
    const privRow = getDb().prepare("SELECT heat_mode, join_code FROM schedules WHERE id=?").get(priv.body.data.id);
    assert.ok(privRow.join_code);
    assert.equal(privRow.heat_mode, "off");

    const activity = await agent
      .post("/api/trips")
      .set(auth(token))
      .send({
        title: "周五夜掼蛋局",
        activityKind: "掼蛋",
        city: "朝阳",
        startDate: dayjs().add(5, "day").format("YYYY-MM-DD"),
        meetupPoint: "三里屯太古里南区",
        meetupTime: "19:30",
        channel: "activity",
        minGroupSize: 4,
        maxSeats: 10,
      })
      .expect(200);
    const actRow = getDb().prepare("SELECT heat_mode, channel FROM schedules WHERE id=?").get(activity.body.data.id);
    assert.equal(actRow.channel, "activity");
    assert.equal(actRow.heat_mode, "off");
  });

  it("drops one virtual when a real user joins an auto-heat trip", async () => {
    const admin = await loginAdmin(agent);
    const company = await loginCompany(agent);
    getDb()
      .prepare(
        "UPDATE schedules SET min_group_size=10, max_seats=30, created_at=datetime('now','localtime','-30 hours'), heat_mode='auto', heat_locked=0 WHERE id=?"
      )
      .run(seed.companyScheduleId);
    await agent
      .post(`/api/admin/schedules/${seed.companyScheduleId}/virtual-users`)
      .set(auth(admin))
      .send({ count: 5, heatMode: "auto", lock: false })
      .expect(200);
    assert.equal(virtualEnrolledCount(seed.companyScheduleId), 5);
    await agent
      .post("/api/enroll")
      .set(auth(company))
      .send(
        enrollPayload({
          scheduleId: seed.companyScheduleId,
          travelerName: "华创同事",
          travelerPhone: "13900139000",
          idCard: ID.maleHb,
        })
      )
      .expect(200);
    assert.equal(realEnrolledCount(seed.companyScheduleId), 1);
    assert.equal(virtualEnrolledCount(seed.companyScheduleId), 4);
  });

  it("quotes from real people so virtuals cannot pull a cheaper tier", async () => {
    const admin = await loginAdmin(agent);
    const token = await loginUser(agent);
    getDb()
      .prepare("UPDATE schedules SET min_group_size=10, max_seats=30, heat_mode='off' WHERE id=?")
      .run(seed.companyScheduleId);
    await agent
      .post(`/api/admin/schedules/${seed.companyScheduleId}/virtual-users`)
      .set(auth(admin))
      .send({ count: 20, heatMode: "off", lock: true })
      .expect(200);
    const pub = await agent.get(`/api/schedules/${seed.companyScheduleId}`).expect(200);
    assert.equal(pub.body.data.quote.originPrice, 199);
    assert.equal(pub.body.data.guaranteed, false);
    const enrolled = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send(
        enrollPayload({
          scheduleId: seed.companyScheduleId,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
        })
      )
      .expect(200);
    assert.equal(enrolled.body.data.quote.originPrice, 199);
  });

  it("keeps virtual enrollments off the live pulse", async () => {
    const admin = await loginAdmin(agent);
    await agent
      .post(`/api/admin/schedules/${seed.individualScheduleId}/virtual-users`)
      .set(auth(admin))
      .send({ count: 4, lock: true })
      .expect(200);
    getDb()
      .prepare(
        `UPDATE enrollments SET created_at=datetime('now','localtime')
         WHERE schedule_id=? AND status='joined'`
      )
      .run(seed.individualScheduleId);
    const pulse = await agent.get("/api/live/pulse").set({ "X-Visitor-Id": "heat-pulse-01" }).expect(200);
    assert.equal(
      pulse.body.data.items.filter((it) => it.kind === "enroll").length,
      0
    );
  });

  it("cancels virtuals on merge instead of moving them into the official trip", async () => {
    const token = await loginUser(agent);
    const admin = await loginAdmin(agent);
    const now = dayjs("2026-09-19");
    const tomorrow = now.add(1, "day").format("YYYY-MM-DD");
    const official = await agent
      .post("/api/admin/schedules")
      .set(auth(admin))
      .send({
        routeId: seed.routeId,
        startDate: tomorrow,
        busTypeId: "bus30",
        minGroupSize: 10,
        meetupPoint: "东直门东方银座C口",
        meetupTime: "07:30",
        organizerType: "official",
      })
      .expect(200);
    const personal = await agent
      .post("/api/schedules")
      .set(auth(token))
      .send({
        routeId: seed.routeId,
        startDate: tomorrow,
        busTypeId: "coaster10",
        minGroupSize: 10,
        meetupPoint: "东直门东方银座C口",
        meetupTime: "07:30",
      })
      .expect(200);
    await agent
      .post(`/api/admin/schedules/${personal.body.data.id}/virtual-users`)
      .set(auth(admin))
      .send({ count: 3, lock: true })
      .expect(200);
    await agent
      .post("/api/enroll")
      .set(auth(token))
      .send(
        enrollPayload({
          scheduleId: personal.body.data.id,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
        })
      )
      .expect(200);
    const result = mergeDueTrips({ now });
    assert.ok(result.sources.includes(personal.body.data.id));
    assert.equal(realEnrolledCount(official.body.data.id), 1);
    assert.equal(virtualEnrolledCount(official.body.data.id), 0);
    assert.equal(virtualEnrolledCount(personal.body.data.id), 0);
  });

  it("rejects virtual accounts on wechat login and caps the pool", async () => {
    const admin = await loginAdmin(agent);
    await agent.post("/api/admin/virtual-users/pool").set(auth(admin)).send({ count: 1 }).expect(200);
    const virtual = getDb().prepare("SELECT id FROM users WHERE IFNULL(is_virtual,0)=1").get();
    const code = "virtual_wx_block";
    getDb().prepare("UPDATE users SET wechat_openid=? WHERE id=?").run(mockOpenid(code), virtual.id);
    const wx = await agent.post("/api/auth/wechat").send({ code });
    assert.equal(wx.status, 400);
    assert.match(wx.body.message, /虚拟账号/);

    const orig = config.virtualHeat.poolSize;
    config.virtualHeat.poolSize = 2;
    try {
      const over = await agent.post("/api/admin/virtual-users/pool").set(auth(admin)).send({ count: 2 });
      assert.equal(over.status, 400);
      assert.match(over.body.message, /最多 2/);
    } finally {
      config.virtualHeat.poolSize = orig;
    }
  });
});
