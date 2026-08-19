const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginCompany, auth, ID, issueCaptcha } = require("./http");

describe("enroll pay member favorites", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("rejects incomplete enroll payload", async () => {
    const token = await loginUser(agent);
    await agent.post("/api/enroll").set(auth(token)).send({ scheduleId: 999 }).expect(400);
    await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({ scheduleId: seed.individualScheduleId, travelerName: "A" })
      .expect(400);
    await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({ scheduleId: seed.individualScheduleId, travelerName: "A", travelerPhone: "13800138000" })
      .expect(400);
    await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: seed.individualScheduleId,
        travelerName: "A",
        travelerPhone: "13800138000",
        idCard: "bad",
      })
      .expect(400);
    const checksum = await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "A",
      travelerPhone: "13800138000",
      idCard: "11010119920512121X",
    });
    assert.equal(checksum.status, 400);
    assert.match(checksum.body.message, /校验码/);
  });

  it("individual enroll reserves a seat without wechat pay", async () => {
    const token = await loginUser(agent);
    const enrolled = await agent
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
    assert.equal(enrolled.body.data.payStatus, "unpaid");
    assert.equal(enrolled.body.data.needPay, false);
    assert.equal(enrolled.body.data.wechatPay, undefined);
    assert.ok(enrolled.body.data.quote.payAmount >= 1);

    const dup = await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: ID.maleBj,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    });
    assert.equal(dup.status, 400);

    const orders = await agent.get("/api/orders").set(auth(token)).expect(200);
    assert.equal(orders.body.data[0].pay_status, "unpaid");
    assert.equal(orders.body.data[0].canCancel, true);
    assert.equal(orders.body.data[0].canReview, true);
    assert.equal(orders.body.data[0].reviewed, false);
    assert.ok(orders.body.data[0].route_id);
    assert.match(orders.body.data[0].idCard, /\*{8}/);
  });

  it("user can cancel unpaid enrollment and rejoin", async () => {
    const token = await loginUser(agent);
    const enrolled = await agent
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
    const id = enrolled.body.data.enrollmentId;
    const cancelled = await agent.post(`/api/orders/${id}/cancel`).set(auth(token)).expect(200);
    assert.equal(cancelled.body.data.status, "cancelled");
    assert.equal(cancelled.body.data.refunded, false);

    const again = await agent.post(`/api/orders/${id}/cancel`).set(auth(token));
    assert.equal(again.status, 400);

    await agent
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
  });

  it("cancels paid enrollment as refunded and rejects others", async () => {
    const token = await loginUser(agent);
    const enrolled = await agent
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
    const id = enrolled.body.data.enrollmentId;
    seed.db.prepare("UPDATE enrollments SET pay_status='paid', pay_amount=199 WHERE id=?").run(id);
    const cancelled = await agent.post(`/api/orders/${id}/cancel`).set(auth(token)).expect(200);
    assert.equal(cancelled.body.data.payStatus, "refunded");
    assert.equal(cancelled.body.data.refunded, true);
    const pay = seed.db.prepare("SELECT * FROM payments WHERE status='refunded' AND enrollment_id=?").get(id);
    assert.ok(pay);

    const companyToken = await loginCompany(agent);
    const other = await agent.post(`/api/orders/${id}/cancel`).set(auth(companyToken));
    assert.equal(other.status, 403);
    const missing = await agent.post("/api/orders/99999/cancel").set(auth(token));
    assert.equal(missing.status, 404);
  });

  it("releases guide when cancel drops below min group size", async () => {
    const token = await loginUser(agent);
    const first = await agent.post("/api/enroll").set(auth(token)).send({
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
    let sch = seed.db.prepare("SELECT * FROM schedules WHERE id=?").get(seed.individualScheduleId);
    assert.ok(sch.guide_id);
    await agent.post(`/api/orders/${first.body.data.enrollmentId}/cancel`).set(auth(token)).expect(200);
    sch = seed.db.prepare("SELECT * FROM schedules WHERE id=?").get(seed.individualScheduleId);
    assert.equal(sch.guide_id, null);
    assert.equal(sch.status, "recruiting");
  });

  it("rejects cancel after trip has started", async () => {
    const token = await loginUser(agent);
    const enrolled = await agent
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
    seed.db
      .prepare("UPDATE schedules SET start_date=date('now','-1 day') WHERE id=?")
      .run(seed.individualScheduleId);
    const res = await agent.post(`/api/orders/${enrolled.body.data.enrollmentId}/cancel`).set(auth(token));
    assert.equal(res.status, 400);
    assert.match(res.body.message, /不可取消|已开始/);
    seed.db
      .prepare("UPDATE schedules SET start_date=date('now') WHERE id=?")
      .run(seed.individualScheduleId);
    const sameDay = await agent.post(`/api/orders/${enrolled.body.data.enrollmentId}/cancel`).set(auth(token));
    assert.equal(sameDay.status, 400);
  });

  it("company enroll stays pending until organizer settles", async () => {
    const userToken = await loginUser(agent);
    const join = await agent
      .post("/api/enroll")
      .set(auth(userToken))
      .send({
        scheduleId: seed.companyScheduleId,
        travelerName: "同事甲",
        travelerPhone: "13800138000",
        idCard: ID.femaleBj,
        emergencyName: "紧急联系人",
        emergencyPhone: "13700000002",
        waiverAccepted: true,
        healthOk: true,
      })
      .expect(200);
    assert.equal(join.body.data.payStatus, "company_pending");

    const capOther = await issueCaptcha(agent);
    const other = await agent
      .post("/api/auth/register")
      .send({ phone: "13600136001", password: "123456", captchaToken: capOther.token, captcha: capOther.code })
      .expect(200);
    const forbidden = await agent
      .post("/api/pay/company-settle")
      .set(auth(other.body.data.token))
      .send({ scheduleId: seed.companyScheduleId });
    assert.equal(forbidden.status, 403);

    const companyToken = await loginCompany(agent);
    const settled = await agent
      .post("/api/pay/company-settle")
      .set(auth(companyToken))
      .send({ scheduleId: seed.companyScheduleId })
      .expect(200);
    assert.equal(settled.body.data.count, 1);
    assert.ok(settled.body.data.total > 0);

    const demo = await agent.get(`/api/schedules/${seed.companyScheduleId}/demographics`).expect(200);
    assert.equal(demo.body.data.total, 1);
  });

  it("joins waitlist when seats are full instead of rejecting", async () => {
    seed.db.prepare("UPDATE schedules SET max_seats=1 WHERE id=?").run(seed.individualScheduleId);
    const token = await loginUser(agent);
    await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: seed.individualScheduleId,
        travelerName: "A",
        travelerPhone: "13800138000",
        idCard: ID.maleBj,
        emergencyName: "紧急联系人",
        emergencyPhone: "13700000002",
        waiverAccepted: true,
        healthOk: true,
      })
      .expect(200);
    const full = await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "B",
      travelerPhone: "13800138000",
      idCard: ID.femaleBj,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    });
    assert.equal(full.status, 200);
    assert.equal(full.body.data.waitlisted, true);
    assert.match(full.body.data.message, /候补/);
  });

  it("matches guide after min group size", async () => {
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
    const sch = seed.db.prepare("SELECT * FROM schedules WHERE id=?").get(seed.individualScheduleId);
    assert.ok(sch.guide_id);
    assert.equal(sch.status, "confirmed");
  });

  it("buys membership via mock pay", async () => {
    const cap = await issueCaptcha(agent);
    const created = await agent
      .post("/api/auth/register")
      .send({ phone: "13600136002", password: "123456", captchaToken: cap.token, captcha: cap.code })
      .expect(200);
    const token = created.body.data.token;
    const buy = await agent.post("/api/member/buy").set(auth(token)).expect(200);
    assert.equal(buy.body.data.amount, 199);
    assert.equal(buy.body.data.user.isMember, true);
    assert.ok(buy.body.data.user.memberExpireAt);
    const me = await agent.get("/api/me").set(auth(token)).expect(200);
    assert.equal(me.body.data.isMember, true);
  });

  it("favorites crud", async () => {
    const token = await loginUser(agent);
    await agent.post(`/api/favorites/${seed.routeId}`).set(auth(token)).expect(200);
    const list = await agent.get("/api/favorites").set(auth(token)).expect(200);
    assert.equal(list.body.data.length, 1);
    await agent.delete(`/api/favorites/${seed.routeId}`).set(auth(token)).expect(200);
    const empty = await agent.get("/api/favorites").set(auth(token)).expect(200);
    assert.equal(empty.body.data.length, 0);
  });

  it("mock pay missing trade returns 400", async () => {
    const token = await loginUser(agent);
    await agent.post("/api/pay/mock-success").set(auth(token)).send({ tradeNo: "NOPE" }).expect(400);
    await agent.post("/api/pay/company-settle").set(auth(token)).send({ scheduleId: 999 }).expect(400);
  });

  it("requires emergency contact, health and waiver", async () => {
    const token = await loginUser(agent);
    const base = {
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: ID.maleBj,
    };
    const noIce = await agent.post("/api/enroll").set(auth(token)).send({ ...base, waiverAccepted: true, healthOk: true });
    assert.equal(noIce.status, 400);
    assert.match(noIce.body.message, /紧急联系人/);
    const samePhone = await agent.post("/api/enroll").set(auth(token)).send({
      ...base,
      emergencyName: "家人",
      emergencyPhone: "13800138000",
      waiverAccepted: true,
      healthOk: true,
    });
    assert.equal(samePhone.status, 400);
    const noWaiver = await agent.post("/api/enroll").set(auth(token)).send({
      ...base,
      emergencyName: "家人",
      emergencyPhone: "13700000002",
      healthOk: true,
    });
    assert.equal(noWaiver.status, 400);
    const ok = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        ...base,
        emergencyName: "家人",
        emergencyPhone: "13700000002",
        waiverAccepted: true,
        healthOk: true,
      })
      .expect(200);
    assert.equal(ok.body.data.status, "joined");
    const trips = await agent.get("/api/me/trips").set(auth(token)).expect(200);
    assert.equal(trips.body.data.length, 1);
    assert.equal(trips.body.data[0].title, "慕田峪长城缆车一日游");
    const sch = await agent.get(`/api/schedules/${seed.individualScheduleId}`).expect(200);
    assert.equal(sch.body.data.guaranteed, false);
    assert.match(sch.body.data.meetupMapUrl, /amap/);
  });
});
