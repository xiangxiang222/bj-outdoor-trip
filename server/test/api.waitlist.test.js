const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, auth, ID } = require("./http");

describe("waitlist", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
    seed.db.prepare("UPDATE schedules SET max_seats=1 WHERE id=?").run(seed.individualScheduleId);
  });

  it("joins waitlist when the bus is full and promotes after a cancel", async () => {
    const token = await loginUser(agent);
    const first = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: seed.individualScheduleId,
        travelerName: "林北野",
        travelerPhone: "13800138000",
        idCard: ID.maleBj,
        emergencyName: "紧急联系人",
        emergencyPhone: "13700000002",
        waiverAccepted: true,
        healthOk: true,
      })
      .expect(200);
    assert.equal(first.body.data.waitlisted, false);
    assert.equal(first.body.data.status, "joined");

    const second = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: seed.individualScheduleId,
        travelerName: "陈小川",
        travelerPhone: "13800138001",
        idCard: ID.femaleBj,
        emergencyName: "紧急联系人",
        emergencyPhone: "13700000002",
        waiverAccepted: true,
        healthOk: true,
      })
      .expect(200);
    assert.equal(second.body.data.waitlisted, true);
    assert.equal(second.body.data.status, "waitlist");
    assert.equal(second.body.data.waitlistPosition, 1);

    const sch = await agent.get(`/api/schedules/${seed.individualScheduleId}`).expect(200);
    assert.equal(sch.body.data.enrolled, 1);
    assert.equal(sch.body.data.remain, 0);
    assert.equal(sch.body.data.waitlistCount, 1);
    assert.equal(sch.body.data.chain.filter((c) => c.waitlisted).length, 1);

    const demo = await agent.get(`/api/schedules/${seed.individualScheduleId}/demographics`).expect(200);
    assert.equal(demo.body.data.total, 1);

    const cancelled = await agent
      .post(`/api/orders/${first.body.data.enrollmentId}/cancel`)
      .set(auth(token))
      .expect(200);
    assert.equal(cancelled.body.data.promoted.enrollmentId, second.body.data.enrollmentId);

    const orders = await agent.get("/api/orders").set(auth(token)).expect(200);
    const promoted = orders.body.data.find((o) => o.id === second.body.data.enrollmentId);
    assert.equal(promoted.status, "joined");
    const sms = seed.db.prepare("SELECT * FROM sms_logs WHERE scene='waitlist' AND ref_id=?").get(second.body.data.enrollmentId);
    assert.ok(sms);
  });

  it("does not occupy a seat while waitlisted", async () => {
    const token = await loginUser(agent);
    await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "A",
      travelerPhone: "13800138000",
      idCard: ID.maleBj,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    });
    await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "B",
      travelerPhone: "13800138000",
      idCard: ID.femaleBj,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    });
    const third = await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "C",
      travelerPhone: "13800138000",
      idCard: ID.maleHb,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    });
    assert.equal(third.body.data.waitlisted, true);
    assert.equal(third.body.data.waitlistPosition, 2);
    const sch = await agent.get(`/api/schedules/${seed.individualScheduleId}`).expect(200);
    assert.equal(sch.body.data.enrolled, 1);
    assert.equal(sch.body.data.waitlistCount, 2);
  });
});
