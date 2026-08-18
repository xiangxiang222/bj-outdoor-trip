const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginCompany, loginAdmin, auth, ID } = require("./http");

describe("dissolve group", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("rejects dissolve without reason and by non-organizer", async () => {
    const token = await loginUser(agent);
    await agent.post(`/api/schedules/${seed.individualScheduleId}/dissolve`).set(auth(token)).send({}).expect(400);
    const other = await loginCompany(agent);
    const forbidden = await agent
      .post(`/api/schedules/${seed.individualScheduleId}/dissolve`)
      .set(auth(other))
      .send({ reason: "天气不好" });
    assert.equal(forbidden.status, 403);
  });

  it("organizer dissolves, refunds paid seats and blocks new enroll", async () => {
    const token = await loginUser(agent);
    const enrolled = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: seed.individualScheduleId,
        travelerName: "林北野",
        travelerPhone: "13800138000",
        idCard: ID.maleBj,
      })
      .expect(200);

    seed.db
      .prepare("UPDATE enrollments SET pay_status='paid', pay_amount=199 WHERE id=?")
      .run(enrolled.body.data.enrollmentId);

    const res = await agent
      .post(`/api/schedules/${seed.individualScheduleId}/dissolve`)
      .set(auth(token))
      .send({ reason: "人数不足不成团" })
      .expect(200);
    assert.equal(res.body.data.status, "cancelled");
    assert.equal(res.body.data.cancelled, 1);
    assert.equal(res.body.data.refunded, 1);
    assert.equal(res.body.data.refundAmount, 199);
    assert.equal(res.body.data.smsCount, 1);

    const detail = await agent.get(`/api/schedules/${seed.individualScheduleId}`).set(auth(token)).expect(200);
    assert.equal(detail.body.data.status, "cancelled");
    assert.equal(detail.body.data.cancelReason, "人数不足不成团");
    assert.equal(detail.body.data.isOrganizer, true);
    assert.equal(detail.body.data.chain[0].payStatus, "refunded");

    const again = await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: ID.femaleBj,
    });
    assert.equal(again.status, 400);
    assert.match(again.body.message, /解散/);

    const dup = await agent
      .post(`/api/schedules/${seed.individualScheduleId}/dissolve`)
      .set(auth(token))
      .send({ reason: "再解散一次" });
    assert.equal(dup.status, 400);

    const sms = seed.db.prepare("SELECT * FROM sms_logs WHERE scene='cancel' AND ref_id=?").all(seed.individualScheduleId);
    assert.equal(sms.length, 1);
    assert.match(sms[0].content, /人数不足不成团/);
    assert.equal(sms[0].status, "sent");

    const pay = seed.db.prepare("SELECT * FROM payments WHERE status='refunded' AND enrollment_id=?").get(enrolled.body.data.enrollmentId);
    assert.ok(pay);
  });

  it("admin can publish and dissolve a group", async () => {
    const adminToken = await loginAdmin(agent);
    const published = await agent
      .post("/api/admin/schedules")
      .set(auth(adminToken))
      .send({
        routeId: seed.routeId,
        startDate: "2099-09-01",
        busTypeId: "bus30",
        organizerType: "individual",
        minGroupSize: 8,
        meetupPoint: "东直门东方银座C口",
        meetupTime: "07:00",
        notes: "后台开团",
      })
      .expect(200);
    const id = published.body.data.id;

    const userToken = await loginUser(agent);
    await agent.post("/api/enroll").set(auth(userToken)).send({
      scheduleId: id,
      travelerName: "同事甲",
      travelerPhone: "13800138000",
      idCard: ID.maleHb,
    });

    const forbidden = await agent.post(`/api/schedules/${id}/dissolve`).set(auth(userToken)).send({ reason: "用户不能解散后台团" });
    assert.equal(forbidden.status, 403);

    const res = await agent
      .post(`/api/admin/schedules/${id}/dissolve`)
      .set(auth(adminToken))
      .send({ reason: "景区临时关闭" })
      .expect(200);
    assert.equal(res.body.data.cancelled, 1);
    assert.equal(res.body.data.refunded, 0);
    assert.equal(res.body.data.smsCount, 1);

    const list = await agent.get("/api/schedules").expect(200);
    assert.equal(list.body.data.some((s) => s.id === id), false);
  });

  it("admin can dissolve every active group at once", async () => {
    const adminToken = await loginAdmin(agent);
    const userToken = await loginUser(agent);
    await agent.post("/api/enroll").set(auth(userToken)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: ID.maleBj,
    });
    const denied = await agent.post("/api/admin/schedules/dissolve-all").set(auth(userToken)).send({ reason: "用户不能全解散" });
    assert.equal(denied.status, 401);

    await agent.post("/api/admin/schedules/dissolve-all").set(auth(adminToken)).send({}).expect(400);
    const res = await agent
      .post("/api/admin/schedules/dissolve-all")
      .set(auth(adminToken))
      .send({ reason: "平台统一取消" })
      .expect(200);
    assert.ok(res.body.data.count >= 2);
    assert.ok(res.body.data.smsCount >= 1);

    const live = await agent.get("/api/schedules").expect(200);
    assert.equal(live.body.data.length, 0);

    const again = await agent.post("/api/admin/schedules/dissolve-all").set(auth(adminToken)).send({ reason: "再解散" });
    assert.equal(again.status, 400);
  });
});
