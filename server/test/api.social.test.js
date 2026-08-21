const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginAdmin, loginCompany, auth, ID, enrollPayload } = require("./http");
const { getDb } = require("../src/db");

describe("social homepage leaders referral virtual fallback", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("exposes official accounts, rules and leader copy on /meta", async () => {
    const res = await agent.get("/api/meta").expect(200);
    assert.ok(res.body.data.officialAccounts.length >= 4);
    assert.ok(res.body.data.commonRules.sections.length >= 4);
    assert.match(res.body.data.leaderRecruitCopy, /200/);
    assert.equal(res.body.data.referralRate, 0.05);
  });

  it("returns album and trip buckets on public user homepage", async () => {
    const token = await loginUser(agent);
    await agent.post("/api/me/photos").set(auth(token)).send({ url: "/static/photos/wall1.jpg" }).expect(200);
    const me = await agent.get("/api/users/" + seed.userId).expect(200);
    assert.equal(me.body.data.album.length, 1);
    assert.ok(me.body.data.trips);
    assert.ok(Array.isArray(me.body.data.trips.upcoming));
    assert.ok(Array.isArray(me.body.data.trips.past));
    assert.ok(Array.isArray(me.body.data.trips.following));
  });

  it("lets an enrolled user pick a seat and blocks guests", async () => {
    const token = await loginUser(agent);
    const pickGuest = await agent.post(`/api/schedules/${seed.individualScheduleId}/seats/pick`).send({ seatNo: "1A" });
    assert.equal(pickGuest.status, 401);
    await agent
      .post("/api/enroll")
      .set(auth(token))
      .send(
        enrollPayload({
          scheduleId: seed.individualScheduleId,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
        })
      )
      .expect(200);
    const picked = await agent
      .post(`/api/schedules/${seed.individualScheduleId}/seats/pick`)
      .set(auth(token))
      .send({ seatNo: "2A" })
      .expect(200);
    assert.equal(picked.body.data.seatNo, "2A");
  });

  it("accepts two volunteer leaders and shows empty slot as apply-able", async () => {
    const token = await loginUser(agent);
    const first = await agent
      .post(`/api/schedules/${seed.individualScheduleId}/leaders/apply`)
      .set(auth(token))
      .expect(200);
    assert.equal(first.body.data.slot, 1);
    const company = await loginCompany(agent);
    await agent
      .post(`/api/schedules/${seed.individualScheduleId}/leaders/apply`)
      .set(auth(company))
      .expect(200);
    const full = await agent.post(`/api/schedules/${seed.individualScheduleId}/leaders/apply`).set(auth(token));
    assert.equal(full.status, 400);
    const sch = await agent.get(`/api/schedules/${seed.individualScheduleId}`).expect(200);
    assert.equal(sch.body.data.leaders.length, 2);
    assert.match(sch.body.data.leaderRecruitCopy, /推荐领队/);
  });

  it("records 5% referral on successful enroll", async () => {
    const token = await loginUser(agent);
    const me = await agent.get("/api/me/referral").set(auth(token)).expect(200);
    assert.ok(me.body.data.code);
    assert.ok(me.body.data.qr);
    const company = await loginCompany(agent);
    await agent
      .post("/api/enroll")
      .set(auth(company))
      .send(
        enrollPayload({
          scheduleId: seed.individualScheduleId,
          travelerName: "华创同事",
          travelerPhone: "13900139000",
          idCard: ID.maleHb,
          referrerCode: me.body.data.code,
        })
      )
      .expect(200);
    const after = await agent.get("/api/me/referral").set(auth(token)).expect(200);
    assert.equal(after.body.data.count, 1);
    assert.ok(after.body.data.pending + after.body.data.earned >= 1);
  });

  it("moves enrollment to a candidate group when the original dissolves", async () => {
    const token = await loginUser(agent);
    const enrolled = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send(
        enrollPayload({
          scheduleId: seed.individualScheduleId,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
          autoAlt: true,
          fallbackScheduleIds: [seed.companyScheduleId],
        })
      )
      .expect(200);
    await agent
      .post(`/api/enrollments/${enrolled.body.data.enrollmentId}/fallbacks`)
      .set(auth(token))
      .send({ scheduleIds: [seed.companyScheduleId], autoAlt: true })
      .expect(200);
    const gone = await agent
      .post(`/api/schedules/${seed.individualScheduleId}/dissolve`)
      .set(auth(token))
      .send({ reason: "人数不够改期" })
      .expect(200);
    assert.equal(gone.body.data.transferred.length, 1);
    assert.equal(gone.body.data.transferred[0].scheduleId, seed.companyScheduleId);
  });

  it("lets ops generate virtual users who yield seats to real enrollments", async () => {
    const admin = await loginAdmin(agent);
    const made = await agent.post("/api/admin/virtual-users").set(auth(admin)).send({ count: 6, perSchedule: 4 }).expect(200);
    assert.ok(made.body.data.created >= 1);
    assert.ok(made.body.data.joined >= 1);
    const list = await agent.get("/api/schedules").expect(200);
    const hit = (list.body.data || []).find((s) => s.virtualEnrolled > 0);
    assert.ok(hit, "virtual users should join a recruiting schedule");
    getDb().prepare("UPDATE schedules SET max_seats=?, min_group_size=? WHERE id=?").run(hit.virtualEnrolled, 8, hit.id);
    const token = await loginUser(agent);
    const enrolled = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send(
        enrollPayload({
          scheduleId: hit.id,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
        })
      )
      .expect(200);
    assert.equal(enrolled.body.data.waitlisted, false);
  });
});
