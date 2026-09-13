const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const { harness, loginAdmin, loginUser, auth, ID } = require("./http");

describe("refund policy API", () => {
  let agent;
  let seed;
  let adminToken;

  beforeEach(async () => {
    ({ agent, seed } = harness());
    adminToken = await loginAdmin(agent);
  });

  it("exposes default global refund ladder on meta and route detail", async () => {
    const meta = await agent.get("/api/meta").expect(200);
    const policy = meta.body.data.refundPolicy;
    assert.equal(policy.useGlobal, true);
    assert.deepEqual(
      policy.tiers.map((t) => [t.minDays, t.percent]),
      [
        [10, 100],
        [3, 80],
        [0, 50],
      ]
    );
    assert.match(meta.body.data.cancelPolicy.summary, /10 天前退 100%/);

    const route = await agent.get(`/api/routes/${seed.routeId}`).expect(200);
    assert.equal(route.body.data.refundPolicy.useGlobal, true);
    assert.equal(route.body.data.refundPolicy.tiers[0].percent, 100);

    const sch = await agent.get(`/api/schedules/${seed.individualScheduleId}`).expect(200);
    assert.equal(sch.body.data.refundPolicy.current.percent, 80);
    assert.equal(sch.body.data.refundPolicy.current.canCancel, true);
  });

  it("saves global rules and per-route override", async () => {
    const saved = await agent
      .put("/api/admin/refund-rules")
      .set(auth(adminToken))
      .send({
        tiers: [
          { minDays: 7, percent: 100 },
          { minDays: 0, percent: 30 },
        ],
      })
      .expect(200);
    assert.equal(saved.body.data.source, "global");
    assert.equal(saved.body.data.tiers[0].minDays, 7);

    const route = await agent.get(`/api/routes/${seed.routeId}`).expect(200);
    assert.equal(route.body.data.refundPolicy.tiers[0].minDays, 7);
    assert.equal(route.body.data.refundPolicy.useGlobal, true);

    const row = seed.db.prepare("SELECT * FROM routes WHERE id=?").get(seed.routeId);

    await agent
      .put(`/api/admin/routes/${seed.routeId}`)
      .set(auth(adminToken))
      .send({
        title: row.title,
        subtitle: row.subtitle,
        days: row.days,
        distanceKm: row.distance_km,
        difficulty: row.difficulty,
        category: row.category,
        region: row.region,
        season: row.season,
        tags: JSON.parse(row.tags_json || "[]"),
        cover: row.cover,
        gallery: JSON.parse(row.gallery_json || "[]"),
        minGroupSize: row.min_group_size,
        description: row.description,
        highlights: JSON.parse(row.highlights_json || "[]"),
        itinerary: JSON.parse(row.itinerary_json || "[]"),
        feeInclude: row.fee_include,
        feeExclude: row.fee_exclude,
        equipment: row.equipment,
        notices: row.notices,
        meetupPoints: JSON.parse(row.meetup_json || "[]"),
        status: row.status,
        refundUseGlobal: false,
        refundTiers: [
          { minDays: 2, percent: 90 },
          { minDays: 0, percent: 10 },
        ],
      })
      .expect(200);

    const custom = await agent.get(`/api/routes/${seed.routeId}`).expect(200);
    assert.equal(custom.body.data.refundPolicy.useGlobal, false);
    assert.equal(custom.body.data.refundPolicy.source, "route");
    assert.equal(custom.body.data.refundPolicy.tiers[0].percent, 90);

    const bad = await agent.put("/api/admin/refund-rules").set(auth(adminToken)).send({ tiers: [{ minDays: 3, percent: 80 }] });
    assert.equal(bad.status, 400);
  });

  it("refunds a paid cancel by ladder and blocks after the trip starts", async () => {
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
    assert.equal(cancelled.body.data.refundPercent, 80);
    assert.equal(cancelled.body.data.refundAmount, 159);
    const pay = seed.db.prepare("SELECT amount, remark FROM payments WHERE status='refunded' AND enrollment_id=?").get(id);
    assert.equal(pay.amount, 159);
    assert.match(pay.remark, /80%/);

    const again = await agent
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
    const second = again.body.data.enrollmentId;
    seed.db.prepare("UPDATE enrollments SET pay_status='paid', pay_amount=200 WHERE id=?").run(second);
    seed.db.prepare("UPDATE schedules SET start_date=? WHERE id=?").run(dayjs().format("YYYY-MM-DD"), seed.individualScheduleId);

    const sameDay = await agent.post(`/api/orders/${second}/cancel`).set(auth(token)).expect(200);
    assert.equal(sameDay.body.data.refundPercent, 50);
    assert.equal(sameDay.body.data.refundAmount, 100);

    const third = await agent
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
    seed.db.prepare("UPDATE schedules SET started_at=datetime('now','localtime') WHERE id=?").run(seed.individualScheduleId);
    const started = await agent.post(`/api/orders/${third.body.data.enrollmentId}/cancel`).set(auth(token));
    assert.equal(started.status, 400);
    assert.match(started.body.message, /正式开团后/);
  });
});
