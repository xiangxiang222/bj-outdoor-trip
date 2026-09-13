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

  it("drafts route copy without a model key", async () => {
    await agent.post("/api/admin/routes/draft").send({ title: "慕田峪长城一日游" }).expect(401);
    const blank = await agent.post("/api/admin/routes/draft").set(auth(adminToken)).send({ title: "" }).expect(400);
    assert.match(blank.body.message, /标题/);
    const res = await agent
      .post("/api/admin/routes/draft")
      .set(auth(adminToken))
      .send({ title: "慕田峪长城一日游", region: "北京市 / 怀柔区", days: 1, notes: "亲子" })
      .expect(200);
    assert.equal(res.body.data.source, "template");
    assert.equal(res.body.data.category, "长城");
    assert.match(res.body.data.description, /慕田峪/);
    assert.ok(Array.isArray(res.body.data.highlights));
    assert.ok(Array.isArray(res.body.data.itinerary));
    assert.deepEqual(res.body.data.gallery, []);
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
        videos: ["https://www.bilibili.com/video/BV1GJ411x7h7"],
      })
      .expect(200);
    const id = created.body.data.id;
    const list = await agent.get("/api/admin/routes").set(auth(adminToken)).expect(200);
    const createdRow = list.body.data.find((r) => r.code === "R99");
    assert.ok(createdRow);
    assert.deepEqual(createdRow.priceTiers, [{ minPeople: 10, maxPeople: null, price: 299, memberPrice: 275 }]);
    assert.deepEqual(createdRow.buses, ["bus30"]);
    assert.deepEqual(createdRow.highlights, ["亮点"]);
    assert.equal(createdRow.videos[0].provider, "bilibili");
    assert.equal(createdRow.videos[0].kind, "iframe");
    assert.match(createdRow.videos[0].embedUrl, /bvid=BV1GJ411x7h7/);

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
        story: [
          { type: "text", body: "先看城墙" },
          { type: "image", url: "/static/photos/wall1.jpg", caption: "慕田峪" },
        ],
        highlights: ["亮点"],
        itinerary: [{ time: "07:30", title: "出发", detail: "集合", photo: "/static/photos/wall1.jpg" }],
        feeInclude: "车",
        feeExclude: "餐",
        equipment: "鞋",
        notices: "注意",
        meetupPoints: [],
        status: "on",
        videos: ["https://www.bilibili.com/video/BV1GJ411x7h7", "https://cdn.example.com/trail.mp4"],
        priceTiers: [{ minPeople: 10, price: 288, memberPrice: 265 }],
        buses: ["coaster10"],
      })
      .expect(200);

    const after = await agent.get(`/api/routes/${id}`).expect(200);
    assert.equal(after.body.data.story[0].body, "先看城墙");
    assert.match(after.body.data.itinerary[0].photo || "", /wall1/);
    assert.equal(after.body.data.videos.length, 2);
    assert.equal(after.body.data.videos[0].kind, "iframe");
    assert.equal(after.body.data.videos[1].kind, "video");

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
