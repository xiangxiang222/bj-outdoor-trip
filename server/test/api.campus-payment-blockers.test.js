const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, auth } = require("./http");
const { paymentBlocksFor } = require("../src/services/campus-payment-blockers");

describe("campus certification payment blockers", () => {
  let agent, seed, token;
  beforeEach(async () => {
    ({ agent, seed } = harness());
    token = await loginUser(agent);
    seed.db.prepare("UPDATE users SET student_status='approved',is_student=1,campus_kind='student',student_revision=3 WHERE id=?").run(seed.userId);
  });
  const user = () => seed.db.prepare("SELECT * FROM users WHERE id=?").get(seed.userId);
  function enrollment(userId = seed.userId, scheduleId = seed.companyScheduleId) {
    return Number(seed.db.prepare("INSERT INTO enrollments(schedule_id,user_id,status,pay_status,pay_amount,campus_snapshot_json) VALUES (?,?,'joined','unpaid',80,?)")
      .run(scheduleId,userId,JSON.stringify({ studentPrice:false })).lastInsertRowid);
  }
  function payment(extra = {}) {
    const p = { enrollmentId:0,userId:seed.companyUserId,scheduleId:seed.companyScheduleId,status:"pending",scene:"company",prepay:"wx-unclosed",remark:"",createdAt:"2000-01-01 00:00:00",...extra };
    return Number(seed.db.prepare("INSERT INTO payments(enrollment_id,user_id,schedule_id,amount,status,scene,wechat_prepay_id,remark,created_at) VALUES (?,?,?,80,?,?,?,?,?)")
      .run(p.enrollmentId,p.userId,p.scheduleId,p.status,p.scene,p.prepay,p.remark,p.createdAt).lastInsertRowid);
  }

  it("does not block the whole company trip for an unrelated member's prepayment", () => {
    enrollment();
    const other = enrollment(seed.companyUserId);
    const id = payment({ remark:JSON.stringify({ lines:[{ id:other,userId:seed.userId,amount:80 }] }) });
    assert.deepEqual(paymentBlocksFor(user()),[],"untrusted line.userId and the same trip cannot associate another person's booking");
    assert.equal(seed.db.prepare("SELECT status FROM payments WHERE id=?").get(id).status,"pending");
  });

  it("blocks only the actual company's payment lines for the enrollee", () => {
    const own = enrollment();
    const id = payment({ remark:JSON.stringify({ lines:[{ id:own,userId:seed.companyUserId,amount:80 }] }),status:"cancelled" });
    const blocks = paymentBlocksFor(user());
    assert.equal(blocks.length,1);
    assert.equal(blocks[0].id,id);
    assert.equal(blocks[0].enrollmentId,own);
    assert.equal(blocks[0].scheduleId,seed.companyScheduleId);
    assert.equal(blocks[0].reason,"wechat_payment_unclosed");
    assert.deepEqual(Object.keys(blocks[0]).sort(),["enrollmentId","id","message","reason","scheduleId"].sort());
  });

  it("includes a payer's own pending payment without revealing another member's booking ID", () => {
    const other = enrollment(seed.companyUserId,seed.individualScheduleId);
    const id = payment({ userId:seed.userId,enrollmentId:other,scene:"enrollment",scheduleId:seed.individualScheduleId });
    const blocks = paymentBlocksFor(user());
    assert.equal(blocks[0].id,id);
    assert.equal(blocks[0].enrollmentId,null);
    assert.equal(blocks[0].scheduleId,seed.individualScheduleId);
    assert.equal(blocks[0].amount,undefined);
    assert.equal(blocks[0].remark,undefined);
  });

  it("finds an enrollee's personal prepayment when another person is paying for them", () => {
    const own = enrollment(seed.userId,seed.individualScheduleId);
    payment({ enrollmentId:own,scene:"enrollment",scheduleId:seed.individualScheduleId,status:"settling" });
    assert.equal(paymentBlocksFor(user())[0].enrollmentId,own);
  });

  it("distinguishes unclosed WeChat prepayments from expired local reservations without mutating either", () => {
    const own = enrollment(seed.userId,seed.individualScheduleId);
    const recent = seed.db.prepare("SELECT datetime('now','localtime') AS at").get().at;
    const live = ["pending","cancelled","settling"].map((status) => payment({ enrollmentId:own,scene:"enrollment",status }));
    const local = payment({ enrollmentId:own,scene:"enrollment",prepay:"",createdAt:recent });
    payment({ enrollmentId:own,scene:"enrollment",prepay:"",status:"pending" });
    payment({ enrollmentId:own,scene:"enrollment",prepay:"",status:"cancelled",createdAt:recent });
    payment({ enrollmentId:own,scene:"enrollment",status:"success" });
    payment({ enrollmentId:own,scene:"enrollment",status:"failed" });
    payment({ enrollmentId:own,userId:seed.userId,scene:"member",createdAt:recent });
    const before = seed.db.prepare("SELECT * FROM payments ORDER BY id").all();
    const blocks = paymentBlocksFor(user());
    assert.deepEqual(blocks.map((b) => b.id),[...live,local]);
    assert.equal(blocks.at(-1).reason,"payment_in_progress");
    assert.deepEqual(seed.db.prepare("SELECT * FROM payments ORDER BY id").all(),before,"the preview is read-only, including locally expired reservations");
  });

  it("does not invent included company members from malformed lines", () => {
    enrollment();
    payment({ remark:"{invalid" });
    payment({ remark:JSON.stringify({ lines:[null,{}, { userId:seed.userId }] }) });
    assert.deepEqual(paymentBlocksFor(user()),[]);
    const id = payment({ userId:seed.userId,remark:"{invalid" });
    assert.deepEqual(paymentBlocksFor(user()).map((b) => [b.id,b.enrollmentId]),[[id,null]],"the actual payer is still associated even if no line can be read");
  });

  it("API preview reveals an ended trip's unclosed payment and matches mutation blocking", async () => {
    const own = enrollment(seed.userId,seed.individualScheduleId);
    const id = payment({ enrollmentId:own,scene:"enrollment",scheduleId:seed.individualScheduleId,status:"cancelled" });
    seed.db.prepare("UPDATE schedules SET start_date='2000-01-01',end_date='2000-01-01',status='completed',completed_at='2000-01-02' WHERE id=?").run(seed.individualScheduleId);
    const paymentsBefore = seed.db.prepare("SELECT * FROM payments").all();
    const preview = await agent.get("/api/me/student/manage").set(auth(token)).expect(200);
    assert.deepEqual(preview.body.data.impact,{ paidConfirmed:0,unpaid:0,applied:0,waitlist:0 });
    assert.equal(preview.body.data.paymentBlocks[0].id,id);
    assert.equal(preview.body.data.paymentBlocks[0].enrollmentId,own);
    assert.deepEqual(seed.db.prepare("SELECT * FROM payments").all(),paymentsBefore);
    const blocked = await agent.post("/api/me/student/revoke").set(auth(token)).send({ revision:3 }).expect(409);
    assert.equal(blocked.body.message,preview.body.data.paymentBlocks[0].message);
    assert.equal(user().student_status,"approved");
    assert.equal(user().student_revision,3);
  });

  it("API allows certification changes when only unrelated company payments remain open", async () => {
    enrollment();
    const other = enrollment(seed.companyUserId);
    payment({ remark:JSON.stringify({ lines:[{ id:other,userId:seed.companyUserId,amount:80 }] }) });
    const preview = await agent.get("/api/me/student/manage").set(auth(token)).expect(200);
    assert.deepEqual(preview.body.data.paymentBlocks,[]);
    await agent.post("/api/me/student/revoke").set(auth(token)).send({ revision:3 }).expect(200);
    assert.equal(user().student_status,"revoked");
  });
});
