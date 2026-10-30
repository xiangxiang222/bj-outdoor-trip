const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginAdmin, auth, campusPayload, enrollPayload, ID } = require("./http");
const { promoteWaitlist } = require("../src/services/enroll");
const { drawOversub } = require("../src/services/oversub");

describe("campus certification lifecycle", () => {
  let agent, seed, token, admin;
  beforeEach(async () => {
    ({ agent, seed } = harness());
    token = await loginUser(agent);
    admin = await loginAdmin(agent);
    seed.db.prepare("UPDATE users SET is_member=0,member_level=1 WHERE id=?").run(seed.userId);
  });
  const me = async () => (await agent.get("/api/me").set(auth(token)).expect(200)).body.data;
  function submit(extra = {}) {
    return { expect:async (status) => agent.post("/api/me/student").set(auth(token)).send(campusPayload({ revision:(await me()).studentRevision, ...extra })).expect(status) };
  }
  function review(revision, action = "approve") {
    return agent.post(`/api/admin/users/${seed.userId}/verify`).set(auth(admin)).send({ kind:"student", action, revision });
  }
  async function approve(extra) {
    const application = await submit(extra).expect(200);
    return (await review(application.body.data.studentRevision).expect(200)).body.data;
  }
  function revoke() {
    return { expect:async (status) => agent.post("/api/me/student/revoke").set(auth(token)).send({ revision:(await me()).studentRevision }).expect(status) };
  }
  function enrollment(extra = {}) {
    return agent.post("/api/enroll").set(auth(token)).send(enrollPayload({ scheduleId:seed.individualScheduleId, travelerName:"林北野", travelerPhone:"13800138000", idCard:ID.maleBj, ...extra }));
  }

  it("requires login and only permits a withdrawal of the current pending application", async () => {
    await agent.get("/api/me/student/manage").expect(401);
    await agent.post("/api/me/student/withdraw").send({ revision:0 }).expect(401);
    const p = (await submit().expect(200)).body.data;
    await submit().expect(409);
    const withdrawn = await agent.post("/api/me/student/withdraw").set(auth(token)).send({ revision:p.studentRevision }).expect(200);
    assert.equal(withdrawn.body.data.studentStatus, "withdrawn");
    assert.equal(withdrawn.body.data.isStudent, false);
    assert.equal(withdrawn.body.data.studentNo, p.studentNo);
    assert.equal(withdrawn.body.data.studentCardUrl, p.studentCardUrl);
    await agent.post("/api/me/student/withdraw").set(auth(token)).send({ revision:p.studentRevision }).expect(409);
    const pending = await agent.get("/api/admin/users?pending=campus").set(auth(admin)).expect(200);
    assert.equal(pending.body.data.length, 0);
    const notices = await agent.get("/api/admin/notices").set(auth(admin)).expect(200);
    assert.equal(notices.body.data.unread, 0);
    await review(p.studentRevision).expect(409);
    const next = (await submit({ school:"清华大学" }).expect(200)).body.data;
    await review(p.studentRevision).expect(409);
    await review(undefined).expect(409);
    await review(next.studentRevision).expect(200);
    await review(next.studentRevision).expect(409);
  });

  it("rejects stale client changes and preserves approved identity until a valid replacement is submitted", async () => {
    const approved = await approve();
    const stale = await agent.post("/api/me/student/revoke").set(auth(token)).send({ revision:approved.studentRevision - 1 }).expect(409);
    assert.equal(stale.body.code, "student_revision_conflict");
    await submit({ studentCardUrl:"" }).expect(400);
    assert.equal((await me()).isStudent, true);
    const changed = await submit({ school:"清华大学", studentCardUrl:"/static/uploads/new-student.jpg" }).expect(200);
    assert.equal(changed.body.data.isStudent, false);
    assert.equal(changed.body.data.studentStatus, "pending");
    assert.equal(changed.body.data.school, "清华大学");
    await review(approved.studentRevision).expect(409);
    await review(changed.body.data.studentRevision).expect(200);
  });

  it("revokes both student flags and private credential associations, keeping shared organization fields", async () => {
    await approve();
    seed.db.prepare("UPDATE users SET group_status='approved',group_name='山鹰社' WHERE id=?").run(seed.userId);
    const result = await revoke().expect(200);
    assert.equal(result.body.data.isStudent, false);
    assert.equal(result.body.data.isAlumni, false);
    assert.equal(result.body.data.studentStatus, "revoked");
    assert.equal(result.body.data.studentCardUrl, "");
    assert.equal(result.body.data.studentNo, "");
    assert.equal(result.body.data.campusKind, "");
    assert.equal(result.body.data.school, "北京大学");
    assert.equal(result.body.data.groupStatus, "approved");
    assert.equal(result.body.data.groupName, "山鹰社");
    const history = JSON.parse(seed.db.prepare("SELECT student_history_json FROM users WHERE id=?").get(seed.userId).student_history_json);
    assert.deepEqual(history.map((row) => row.action), ["submit","approve","revoke"]);
    await revoke().expect(409);
  });

  it("requires fresh alumni proof and awards only alumni qualification after review", async () => {
    await approve();
    await submit({ campusKind:"alumni" }).expect(400);
    await submit({ campusKind:"alumni", studentCardUrl:"https://togetherbetter.cn/static/uploads/student-card.jpg?preview=1" }).expect(400);
    const p = await submit({ campusKind:"alumni", studentNo:"", studentCardUrl:"/static/uploads/alumni.jpg" }).expect(200);
    assert.equal(p.body.data.isStudent, false);
    const result = await review(p.body.data.studentRevision).expect(200);
    assert.equal(result.body.data.isStudent, false);
    assert.equal(result.body.data.isAlumni, true);
    assert.equal(result.body.data.studentNo, "");
    const revoked = await revoke().expect(200);
    assert.equal(revoked.body.data.isAlumni, false);
  });

  it("preserves paid confirmed bookings but stops new restricted bookings", async () => {
    await approve();
    seed.db.prepare("UPDATE schedules SET student_only=1 WHERE id=?").run(seed.individualScheduleId);
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    seed.db.prepare("UPDATE enrollments SET pay_status='paid' WHERE id=?").run(id);
    const before = seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(id);
    const impact = await agent.get("/api/me/student/manage").set(auth(token)).expect(200);
    assert.equal(impact.body.data.impact.paidConfirmed, 1);
    await revoke().expect(200);
    const after = seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(id);
    assert.equal(after.status, before.status);
    assert.equal(after.pay_amount, before.pay_amount);
    assert.equal(after.seat_no, before.seat_no);
    const view = await agent.get(`/api/schedules/${seed.individualScheduleId}`).set(auth(token)).expect(200);
    assert.equal(view.body.data.eligibility.canEnroll, false);
  });

  it("blocks a recorded student discount after the schedule later disables student prices", async () => {
    await approve();
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    const snapshot = JSON.parse(seed.db.prepare("SELECT campus_snapshot_json FROM enrollments WHERE id=?").get(id).campus_snapshot_json);
    assert.equal(snapshot.priceBasis, "booking");
    assert.ok(snapshot.bookedTripPrice < snapshot.ordinaryTripPrice);
    assert.equal(snapshot.studentPrice, true);
    seed.db.prepare("UPDATE schedules SET student_price_on=0 WHERE id=?").run(seed.individualScheduleId);
    seed.db.prepare("UPDATE users SET wallet_balance=1000 WHERE id=?").run(seed.userId);
    const before = seed.db.prepare("SELECT pay_amount FROM enrollments WHERE id=?").get(id).pay_amount;
    await revoke().expect(200);
    const pay = await agent.post("/api/pay/for-enrollment").set(auth(token)).send({ enrollmentId:id, channel:"wallet" });
    assert.equal(pay.status, 409, JSON.stringify(pay.body));
    assert.match(pay.body.message, /学生价/);
    assert.equal(seed.db.prepare("SELECT pay_amount FROM enrollments WHERE id=?").get(id).pay_amount, before);
    assert.equal(seed.db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.userId).wallet_balance, 1000);
  });

  it("rechecks identity after awaiting the WeChat session before reserving money", async () => {
    await approve();
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    const { payEnrollment } = require("../src/services/payment");
    const paying = payEnrollment(id, seed.userId, {});
    seed.db.prepare("UPDATE users SET student_status='revoked',is_student=0 WHERE id=?").run(seed.userId);
    await assert.rejects(paying, (error) => error.status === 409 && error.code === "campus_eligibility_changed");
    assert.equal(seed.db.prepare("SELECT COUNT(*) c FROM payments WHERE enrollment_id=?").get(id).c, 0);
  });

  it("leaves ordinary bookings payable after revocation without repricing", async () => {
    await approve();
    seed.db.prepare("UPDATE schedules SET student_price_on=0 WHERE id=?").run(seed.individualScheduleId);
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    const snapshot = JSON.parse(seed.db.prepare("SELECT campus_snapshot_json FROM enrollments WHERE id=?").get(id).campus_snapshot_json);
    assert.equal(snapshot.studentPrice, false);
    assert.equal(snapshot.bookedTripPrice, snapshot.ordinaryTripPrice);
    seed.db.prepare("UPDATE schedules SET student_price_on=1 WHERE id=?").run(seed.individualScheduleId);
    await revoke().expect(200);
    const { assertCampusEnrollment } = require("../src/services/campus-certification");
    assert.doesNotThrow(() => assertCampusEnrollment(seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(id), seed.db.prepare("SELECT * FROM schedules WHERE id=?").get(seed.individualScheduleId)));
  });

  it("does not guess a legacy full-price booking from student pricing enabled later", async () => {
    await approve();
    seed.db.prepare("UPDATE schedules SET student_price_on=0 WHERE id=?").run(seed.individualScheduleId);
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    seed.db.prepare("UPDATE enrollments SET campus_snapshot_json='' WHERE id=?").run(id);
    seed.db.prepare("UPDATE schedules SET student_price_on=1 WHERE id=?").run(seed.individualScheduleId);
    const result = await revoke().expect(409);
    assert.equal(result.body.code, "legacy_price_unknown");
    assert.match(result.body.message, /缺少当时普通价记录/);
    assert.equal((await me()).isStudent, true);
    assert.equal(seed.db.prepare("SELECT campus_snapshot_json FROM enrollments WHERE id=?").get(id).campus_snapshot_json, "");
    seed.db.prepare("UPDATE users SET wallet_balance=1000 WHERE id=?").run(seed.userId);
    await agent.post("/api/pay/for-enrollment").set(auth(token)).send({ enrollmentId:id, channel:"wallet" }).expect(200);
    await revoke().expect(200);
  });

  it("does not release a legacy student-price booking merely because student pricing was disabled later", async () => {
    await approve();
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    seed.db.prepare("UPDATE enrollments SET campus_snapshot_json='' WHERE id=?").run(id);
    seed.db.prepare("UPDATE schedules SET student_price_on=0 WHERE id=?").run(seed.individualScheduleId);
    const result = await revoke().expect(409);
    assert.equal(result.body.code, "legacy_price_unknown");
    const changed = await submit({ school:"清华大学" }).expect(409);
    assert.equal(changed.body.code, "legacy_price_unknown");
    assert.equal((await me()).isStudent, true);
    seed.db.prepare("UPDATE enrollments SET status='cancelled' WHERE id=?").run(id);
    await revoke().expect(200);
  });

  it("reports unresolved legacy prices for ended schedules without writing guessed snapshots", async () => {
    await approve();
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    seed.db.prepare("UPDATE enrollments SET campus_snapshot_json='' WHERE id=?").run(id);
    seed.db.prepare("UPDATE schedules SET status='completed',start_date=date('now','+8 hours','-10 days'),end_date=date('now','+8 hours','-9 days'),completed_at=datetime('now','localtime','-9 days') WHERE id=?").run(seed.individualScheduleId);
    const { historicalPriceReviews } = require("../src/services/campus-certification");
    const reviews = historicalPriceReviews(seed.db.prepare("SELECT * FROM users WHERE id=?").get(seed.userId));
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].enrollmentId, id);
    assert.equal(seed.db.prepare("SELECT campus_snapshot_json FROM enrollments WHERE id=?").get(id).campus_snapshot_json, "");
    await revoke().expect(409);
  });

  it("keeps an earlier explicit discount record without inventing missing historical quotes", async () => {
    await approve();
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    seed.db.prepare("UPDATE enrollments SET campus_snapshot_json=? WHERE id=?").run(JSON.stringify({ studentPrice:false,revision:2 }),id);
    await revoke().expect(200);
    const { assertCampusEnrollment } = require("../src/services/campus-certification");
    assert.doesNotThrow(() => assertCampusEnrollment(seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(id), seed.db.prepare("SELECT * FROM schedules WHERE id=?").get(seed.individualScheduleId)));
  });

  it("does not label an equally good membership price as a student-only discount", async () => {
    await approve();
    seed.db.prepare("UPDATE users SET is_member=1,member_level=5 WHERE id=?").run(seed.userId);
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    const snapshot = JSON.parse(seed.db.prepare("SELECT campus_snapshot_json FROM enrollments WHERE id=?").get(id).campus_snapshot_json);
    assert.equal(snapshot.studentPrice, false);
    assert.equal(snapshot.bookedTripPrice, snapshot.ordinaryTripPrice);
    await revoke().expect(200);
    const { assertCampusEnrollment } = require("../src/services/campus-certification");
    assert.doesNotThrow(() => assertCampusEnrollment(seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(id), seed.db.prepare("SELECT * FROM schedules WHERE id=?").get(seed.individualScheduleId)));
  });

  it("compares student pricing against the same coupon instead of the current full fare", async () => {
    await approve();
    const created = await agent.post("/api/admin/coupons").set(auth(admin)).send({ scheduleId:seed.individualScheduleId,kind:"amount",value:50,total:5,name:"认证价格测试券" }).expect(200);
    const id = (await enrollment({ couponCode:created.body.data.code }).expect(200)).body.data.enrollmentId;
    const snapshot = JSON.parse(seed.db.prepare("SELECT campus_snapshot_json FROM enrollments WHERE id=?").get(id).campus_snapshot_json);
    assert.equal(snapshot.studentPrice, false);
    assert.equal(snapshot.bookedTripPrice, 149);
    assert.equal(snapshot.ordinaryTripPrice, 149);
    await revoke().expect(200);
    seed.db.prepare("UPDATE users SET wallet_balance=1000 WHERE id=?").run(seed.userId);
    await agent.post("/api/pay/for-enrollment").set(auth(token)).send({ enrollmentId:id,channel:"wallet" }).expect(200);
  });

  it("records a gifted booking as zero fare and never as a student discount", async () => {
    await approve();
    seed.db.prepare("UPDATE users SET is_member=1,member_level=2,member_gift_left=1 WHERE id=?").run(seed.userId);
    seed.db.prepare("UPDATE route_price_tiers SET price=50 WHERE route_id=(SELECT route_id FROM schedules WHERE id=?)").run(seed.individualScheduleId);
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    const snapshot = JSON.parse(seed.db.prepare("SELECT campus_snapshot_json FROM enrollments WHERE id=?").get(id).campus_snapshot_json);
    assert.equal(snapshot.studentPrice, false);
    assert.equal(snapshot.bookedTripPrice, 0);
    assert.equal(snapshot.ordinaryTripPrice, 0);
    await revoke().expect(200);
  });

  it("holds draw and waitlist seats until current campus eligibility is restored", async () => {
    await approve();
    seed.db.prepare("UPDATE schedules SET student_only=1,oversub=1 WHERE id=?").run(seed.individualScheduleId);
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    await revoke().expect(200);
    const draw = drawOversub(seed.individualScheduleId);
    assert.equal(draw.winnerCount, 0);
    assert.equal(draw.needsVerificationCount, 1);
    assert.equal(draw.applied, 1);
    assert.equal(draw.eligibleCount, 0);
    const notice = seed.db.prepare("SELECT * FROM user_notices WHERE user_id=? AND ref_type='enrollment' AND ref_id=?").get(seed.userId, id);
    assert.match(notice.body, /重新认证/);
    assert.equal(notice.title, "报名需重新核验校园身份");
    assert.equal(seed.db.prepare("SELECT status FROM enrollments WHERE id=?").get(id).status, "waitlist");
    assert.equal(promoteWaitlist(seed.individualScheduleId), null);
    await approve();
    assert.equal(promoteWaitlist(seed.individualScheduleId).enrollmentId, id);
  });

  it("includes ongoing multi-day journeys in the impact preview", async () => {
    await approve();
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    seed.db.prepare("UPDATE schedules SET start_date=date('now','+8 hours','-1 day'),end_date=date('now','+8 hours','+1 day') WHERE id=?").run(seed.individualScheduleId);
    seed.db.prepare("UPDATE enrollments SET pay_status='paid' WHERE id=?").run(id);
    const preview = await agent.get("/api/me/student/manage").set(auth(token)).expect(200);
    assert.equal(preview.body.data.impact.paidConfirmed, 1);
  });

  it("also prevents a restricted company booking from bypassing campus checks through settlement", async () => {
    await approve();
    seed.db.prepare("UPDATE schedules SET student_only=1 WHERE id=?").run(seed.companyScheduleId);
    await enrollment({ scheduleId:seed.companyScheduleId }).expect(200);
    await revoke().expect(200);
    const settled = await agent.post(`/api/admin/schedules/${seed.companyScheduleId}/settle`).set(auth(admin)).send({}).expect(409);
    assert.equal(settled.body.code, "campus_eligibility_changed");
    const company = await loginUser(agent, "13900139000");
    await agent.post("/api/pay/company-settle").set(auth(company)).send({ scheduleId:seed.companyScheduleId }).expect(409);
  });

  it("does not mistake an expired local prepayment for confirmed WeChat closure", async () => {
    await approve();
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    seed.db.prepare("INSERT INTO payments(enrollment_id,user_id,schedule_id,amount,status,scene,wechat_prepay_id,created_at) VALUES(?,?,?,?, 'cancelled','enrollment','wx-live-prepay',datetime('now','localtime','-2 hours'))").run(id, seed.userId, seed.individualScheduleId, 10);
    const blocked = await revoke().expect(409);
    assert.match(blocked.body.message, /尚未确认关闭的微信支付/);
    assert.equal((await me()).isStudent, true);
    seed.db.prepare("UPDATE payments SET status='settling' WHERE enrollment_id=?").run(id);
    await revoke().expect(409);
    seed.db.prepare("UPDATE payments SET status='success' WHERE enrollment_id=?").run(id);
    seed.db.prepare("UPDATE enrollments SET pay_status='paid' WHERE id=?").run(id);
    await revoke().expect(200);
    assert.equal(seed.db.prepare("SELECT pay_status FROM enrollments WHERE id=?").get(id).pay_status, "paid");
  });

  it("rechecks the target eligibility when automatically transferring a paid source booking", async () => {
    await approve();
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    seed.db.prepare("UPDATE enrollments SET pay_status='paid' WHERE id=?").run(id);
    seed.db.prepare("UPDATE schedules SET student_only=1 WHERE id=?").run(seed.companyScheduleId);
    const { setFallbacks, tryTransfer } = require("../src/services/fallback");
    setFallbacks(id, seed.userId, { scheduleIds:[seed.companyScheduleId] });
    await revoke().expect(200);
    const source = seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(id);
    assert.equal(tryTransfer(source), null);
    assert.equal(seed.db.prepare("SELECT COUNT(*) c FROM enrollments WHERE schedule_id=? AND user_id=?").get(seed.companyScheduleId, seed.userId).c, 0);
    await approve();
    const transfer = tryTransfer(source);
    assert.equal(transfer.scheduleId, seed.companyScheduleId);
    const snapshot = seed.db.prepare("SELECT campus_snapshot_json FROM enrollments WHERE id=?").get(transfer.enrollmentId).campus_snapshot_json;
    assert.equal(JSON.parse(snapshot).revision, (await me()).studentRevision);
  });

  it("prevents identity changes while a payment is in flight", async () => {
    await approve();
    const id = (await enrollment().expect(200)).body.data.enrollmentId;
    seed.db.prepare("INSERT INTO payments(enrollment_id,user_id,schedule_id,amount,status,scene) VALUES(?,?,?,?, 'pending','enrollment')").run(id, seed.userId, seed.individualScheduleId, 10);
    const blocked = await revoke().expect(409);
    assert.match(blocked.body.message, /正在支付/);
    assert.equal((await me()).isStudent, true);
    seed.db.prepare("UPDATE payments SET created_at=datetime('now','localtime','-31 minutes') WHERE enrollment_id=?").run(id);
    await revoke().expect(200);
  });
});
