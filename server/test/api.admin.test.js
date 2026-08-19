const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const { harness, loginAdmin, loginUser, auth, ID } = require("./http");

describe("admin API", () => {
  let agent;
  let seed;
  let adminToken;

  beforeEach(async () => {
    ({ agent, seed } = harness());
    adminToken = await loginAdmin(agent);
  });

  it("rejects bad admin password and user token", async () => {
    await agent.post("/api/admin/login").send({ username: "admin", password: "nope" }).expect(400);
    const userToken = await loginUser(agent);
    await agent.get("/api/admin/dashboard").set(auth(userToken)).expect(401);
    await agent.get("/api/admin/dashboard").expect(401);
  });

  it("returns dashboard kpis", async () => {
    const res = await agent.get("/api/admin/dashboard").set(auth(adminToken)).expect(200);
    assert.equal(res.body.data.routeCount, 1);
    assert.ok(res.body.data.userCount >= 2);
    assert.ok(Array.isArray(res.body.data.byRoute));
    assert.ok(Array.isArray(res.body.data.byDay));
  });

  it("creates updates and off-shelves a route", async () => {
    const created = await agent
      .post("/api/admin/routes")
      .set(auth(adminToken))
      .send({
        code: "R99",
        title: "测试新线路",
        days: 2,
        category: "山水",
        region: "京郊",
        minGroupSize: 8,
        priceTiers: [{ minPeople: 10, price: 299, memberPrice: 275 }],
        buses: ["bus30"],
        tags: ["测试"],
        highlights: ["亮点"],
      })
      .expect(200);
    const id = created.body.data.id;
    const list = await agent.get("/api/admin/routes").set(auth(adminToken)).expect(200);
    assert.ok(list.body.data.some((r) => r.code === "R99"));

    await agent
      .put(`/api/admin/routes/${id}`)
      .set(auth(adminToken))
      .send({
        title: "测试新线路改名",
        subtitle: "改",
        days: 2,
        distanceKm: 100,
        difficulty: "休闲",
        category: "山水",
        region: "京郊",
        season: "四季",
        tags: ["测试"],
        cover: "/static/routes/R99.svg",
        gallery: [],
        minGroupSize: 8,
        description: "介绍",
        highlights: ["亮点"],
        itinerary: [],
        feeInclude: "车",
        feeExclude: "餐",
        equipment: "鞋",
        notices: "注意",
        meetupPoints: [],
        status: "on",
        priceTiers: [{ minPeople: 10, price: 288, memberPrice: 265 }],
        buses: ["coaster10"],
      })
      .expect(200);

    await agent.delete(`/api/admin/routes/${id}`).set(auth(adminToken)).expect(200);
    const publicList = await agent.get("/api/routes").expect(200);
    assert.equal(publicList.body.data.some((r) => r.code === "R99"), false);
  });

  it("admin publishes schedule, updates cost, settles company group", async () => {
    const published = await agent
      .post("/api/admin/schedules")
      .set(auth(adminToken))
      .send({
        routeId: seed.routeId,
        startDate: dayjs().add(20, "day").format("YYYY-MM-DD"),
        busTypeId: "bus30",
        organizerType: "company",
        companyName: "后台测试公司",
        minGroupSize: 2,
        meetupPoint: "国贸桥下大巴停靠点",
      })
      .expect(200);
    const scheduleId = published.body.data.id;

    const cost = await agent
      .put(`/api/admin/schedules/${scheduleId}/cost`)
      .set(auth(adminToken))
      .send({ transport: 1000, ticket: 200, hotel: 0, meal: 100, guide: 300, other: 50 })
      .expect(200);
    assert.equal(cost.body.data.cost, 1650);

    const userToken = await loginUser(agent);
    await agent.post("/api/enroll").set(auth(userToken)).send({
      scheduleId,
      travelerName: "报名甲",
      travelerPhone: "13800138000",
      idCard: ID.maleHb,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    });

    const settle = await agent.post(`/api/admin/schedules/${scheduleId}/settle`).set(auth(adminToken)).expect(200);
    assert.equal(settle.body.data.count, 1);

    const all = await agent.get("/api/admin/schedules").set(auth(adminToken)).expect(200);
    assert.ok(all.body.data.some((s) => s.id === scheduleId));

    const ens = await agent.get(`/api/admin/enrollments?scheduleId=${scheduleId}`).set(auth(adminToken)).expect(200);
    assert.equal(ens.body.data.length, 1);
    assert.match(ens.body.data[0].id_card, /\*{8}/);

    const users = await agent.get("/api/admin/users").set(auth(adminToken)).expect(200);
    assert.ok(users.body.data.some((u) => u.phone === "13800138000"));

    const demo = await agent.get(`/api/admin/schedules/${scheduleId}/demographics`).set(auth(adminToken)).expect(200);
    assert.equal(demo.body.data.total, 1);
  });

  it("uploads a route photo for admin", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const denied = await agent.post("/api/admin/upload").attach("file", png, "dot.png").expect(401);
    assert.equal(denied.body.ok, false);

    const res = await agent
      .post("/api/admin/upload")
      .set(auth(adminToken))
      .attach("file", png, "dot.png")
      .expect(200);
    assert.match(res.body.data.url, /^\/static\/uploads\/.+\.png$/);

    const created = await agent
      .post("/api/admin/routes")
      .set(auth(adminToken))
      .send({
        title: "带图线路",
        cover: res.body.data.url,
        gallery: [res.body.data.url],
        priceTiers: [{ minPeople: 10, price: 199, memberPrice: 183 }],
        buses: ["bus30"],
      })
      .expect(200);
    const list = await agent.get("/api/admin/routes").set(auth(adminToken)).expect(200);
    const row = list.body.data.find((r) => r.id === created.body.data.id);
    assert.ok(row.cover.includes("/static/uploads/"));
    assert.equal(row.gallery.length, 1);

    await agent.post("/api/admin/upload").set(auth(adminToken)).attach("file", Buffer.from("not-an-image"), "notes.txt").expect(400);
  });

  it("rejects admin schedule without route or bus", async () => {
    await agent.post("/api/admin/schedules").set(auth(adminToken)).send({ routeId: 999, startDate: "2099-01-01", busTypeId: "bus30" }).expect(400);
    await agent
      .post("/api/admin/schedules")
      .set(auth(adminToken))
      .send({ routeId: seed.routeId, startDate: "2099-01-01", busTypeId: "nope" })
      .expect(400);
  });
});
