const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginAdmin, issueCaptcha, auth, ID } = require("./http");

describe("trip page extras", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("exposes bus seats/photos, precise meetup, hourly weather and contacts", async () => {
    const sch = await agent.get("/api/schedules/" + seed.individualScheduleId).expect(200);
    assert.equal(sch.body.data.bus.seats, 10);
    assert.ok(Array.isArray(sch.body.data.bus.photos));
    assert.equal(sch.body.data.meetupPrecise, true);
    assert.ok(sch.body.data.meetupLat);
    assert.match(sch.body.data.meetupMapUrl, /marker/);
    assert.ok(Array.isArray(sch.body.data.gallery));

    const weather = await agent.get("/api/weather").query({ region: "慕田峪长城", date: "2026-09-01" }).expect(200);
    assert.ok(Array.isArray(weather.body.data.hourly) && weather.body.data.hourly.length >= 8);
    assert.ok(weather.body.data.hourly[0].hour);

    const meta = await agent.get("/api/meta").expect(200);
    assert.equal(meta.body.data.contacts.officialWechat, "beiyexing");
  });

  it("shows age band on roster, public user page without phone, and allows anyone to pay unpaid", async () => {
    const token = await loginUser(agent);
    const enrolled = await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: ID.maleBj,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
      seatNo: "1A",
    }).expect(200);
    const detail = await agent.get("/api/schedules/" + seed.individualScheduleId).expect(200);
    const row = detail.body.data.chain[0];
    assert.equal(row.lifeStage, "青年");
    assert.equal(row.canPay, true);
    assert.equal(row.userId, seed.userId);

    const profile = await agent.get("/api/users/" + seed.userId).expect(200);
    assert.equal(profile.body.data.nickname, "林北野");
    assert.equal(profile.body.data.lifeStage, "青年");
    assert.equal(profile.body.data.phone, undefined);

    const seats = await agent.get("/api/schedules/" + seed.individualScheduleId + "/seats").expect(200);
    const occ = seats.body.data.seats.find((s) => s.no === "1A");
    assert.equal(occ.occupant.lifeStage, "青年");
    assert.equal(occ.occupant.userId, seed.userId);

    const paid = await agent.post("/api/pay/for-enrollment").set(auth(token)).send({ enrollmentId: enrolled.body.data.enrollmentId }).expect(200);
    assert.equal(paid.body.data.payStatus, "paid");
    const after = await agent.get("/api/schedules/" + seed.individualScheduleId).expect(200);
    assert.equal(after.body.data.chain[0].canPay, false);
    assert.equal(after.body.data.chain[0].payStatus, "paid");
  });

  it("lets admin lock a seat and swap two passengers", async () => {
    const token = await loginUser(agent);
    const adminToken = await loginAdmin(agent);
    await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: ID.maleBj,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
      seatNo: "1A",
    }).expect(200);
    const second = await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "陈小川",
      travelerPhone: "13800138000",
      idCard: ID.femaleBj,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
      seatNo: "1B",
    }).expect(200);

    await agent.post(`/api/admin/schedules/${seed.individualScheduleId}/seats/lock`).set(auth(adminToken)).send({ seatNo: "1C", locked: true }).expect(200);
    const blocked = await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "第三人",
      travelerPhone: "13800138000",
      idCard: ID.maleHb,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
      seatNo: "1C",
    });
    assert.equal(blocked.status, 400);
    assert.match(blocked.body.message, /锁定/);

    const swapped = await agent
      .post(`/api/admin/schedules/${seed.individualScheduleId}/seats/assign`)
      .set(auth(adminToken))
      .send({ enrollmentId: second.body.data.enrollmentId, seatNo: "1A" })
      .expect(200);
    assert.equal(swapped.body.data.seatNo, "1A");
    const seats = await agent.get("/api/schedules/" + seed.individualScheduleId + "/seats").expect(200);
    assert.equal(seats.body.data.seats.find((s) => s.no === "1A").enrollmentId, second.body.data.enrollmentId);
    assert.equal(seats.body.data.seats.find((s) => s.no === "1C").locked, true);

    await agent.put(`/api/admin/schedules/${seed.individualScheduleId}/trip`).set(auth(adminToken)).send({
      plateNo: "京A·TEST01",
      consultGroup: "测试咨询群",
    }).expect(200);
    const sch = await agent.get("/api/schedules/" + seed.individualScheduleId).expect(200);
    assert.equal(sch.body.data.bus.plateNo, "京A·TEST01");
    assert.equal(sch.body.data.consultGroup, "测试咨询群");
  });

  it("lets assigned guide lock seats", async () => {
    const token = await loginUser(agent);
    await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: ID.maleBj,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    });
    await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "陈小川",
      travelerPhone: "13800138000",
      idCard: ID.femaleBj,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    });
    const cap = await issueCaptcha(agent);
    const login = await agent.post("/api/guide/login").send({
      phone: "13700001101",
      captchaToken: cap.token,
      captcha: cap.code,
    }).expect(200);
    await agent
      .post(`/api/guide/schedules/${seed.individualScheduleId}/seats/lock`)
      .set(auth(login.body.data.token))
      .send({ seatNo: "2A", locked: true })
      .expect(200);
    const seats = await agent.get("/api/schedules/" + seed.individualScheduleId + "/seats").expect(200);
    assert.equal(seats.body.data.seats.find((s) => s.no === "2A").locked, true);
  });
});
