const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginAdmin, auth, issueCaptcha } = require("./http");

describe("homepage and publish review", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("returns home payload with cities, tags, festivals and durations", async () => {
    const res = await agent.get("/api/home").expect(200);
    const d = res.body.data;
    assert.equal(d.brand.kicker, "同行者众");
    assert.ok(d.brand.slides.length >= 1);
    assert.ok(d.brand.slides.every((s) => s.routeId && s.url && s.title && s.code));
    assert.equal(d.brand.gallery.length, d.brand.slides.length);
    assert.ok(d.cities.some((c) => c.name === "怀柔"));
    assert.ok(d.cities.every((c) => (c.slides || []).every((s) => s.routeId && s.url)));
    assert.ok(!JSON.stringify(d.brand.slides).includes("wikimedia"));
    assert.ok(d.tags.length >= 5);
    assert.ok(d.tags.some((t) => t.name === "徒步" && t.color));
    assert.ok(d.festivals.length >= 1);
    assert.equal(d.durations.length, 4);
    assert.equal(d.durations[3].key, "multi");
    assert.ok(d.offers.some((o) => o.key === "early"));
    assert.ok(d.offers.some((o) => o.key === "family"));
    assert.ok(d.offers.some((o) => o.key === "combo"));
  });

  it("accepts student apply, feedback and photographer enroll waive", async () => {
    const token = await loginUser(agent);
    const stu = await agent.post("/api/me/student").set(auth(token)).send({ school: "北京大学" }).expect(200);
    assert.equal(stu.body.data.studentStatus, "pending");
    await agent.post("/api/feedback").set(auth(token)).send({ kind: "suggest", content: "希望增加夜观星空" }).expect(200);
    const admin = await loginAdmin(agent);
    await agent.post(`/api/admin/users/${seed.userId}/verify`).set(auth(admin)).send({ kind: "student", action: "approve" }).expect(200);
    const me = await agent.get("/api/me").set(auth(token)).expect(200);
    assert.equal(me.body.data.isStudent, true);
    const enrolled = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: seed.individualScheduleId,
        travelerName: "林北野",
        travelerPhone: "13800138000",
        idCard: "110101199205121219",
        emergencyName: "紧急",
        emergencyPhone: "13700000002",
        waiverAccepted: true,
        healthOk: true,
        joinMode: "photographer",
      })
      .expect(200);
    assert.equal(enrolled.body.data.payStatus, "paid");
    assert.equal(enrolled.body.data.quote.payAmount, 0);
  });

  it("lists play tags publicly", async () => {
    const res = await agent.get("/api/play-tags").expect(200);
    assert.ok(res.body.data.some((t) => t.name === "登山"));
  });

  it("admin can add a play tag", async () => {
    const token = await loginAdmin(agent);
    const created = await agent.post("/api/admin/play-tags").set(auth(token)).send({ name: "看鸟" }).expect(200);
    assert.equal(created.body.data.name, "看鸟");
    assert.ok(created.body.data.color);
  });

  it("user publish waits for review and then appears", async () => {
    const token = await loginUser(agent);
    const buses = await agent.get("/api/buses").expect(200);
    const start = seed.db.prepare("SELECT date('now','+3 day') AS d").get().d;
    const created = await agent
      .post("/api/trips")
      .set(auth(token))
      .send({
        title: "自创怀柔徒步",
        city: "怀柔",
        days: 1,
        originPrice: 88,
        startDate: start,
        busTypeId: buses.body.data[0].id,
        meetupPoint: "东直门东方银座C口",
        offerType: "early",
        minGroupSize: 4,
      })
      .expect(200);
    assert.equal(created.body.data.reviewStatus, "pending");
    const list = await agent.get("/api/schedules").expect(200);
    assert.equal(list.body.data.some((s) => s.id === created.body.data.id), false);
    await agent.post(`/api/enroll`).set(auth(token)).send({
      scheduleId: created.body.data.id,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: "110101199205121219",
      emergencyName: "紧急",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    }).expect(400);
    const admin = await loginAdmin(agent);
    await agent.post(`/api/admin/schedules/${created.body.data.id}/review`).set(auth(admin)).send({ status: "approved" }).expect(200);
    const after = await agent.get("/api/schedules").expect(200);
    assert.ok(after.body.data.some((s) => s.id === created.body.data.id));
  });
});
