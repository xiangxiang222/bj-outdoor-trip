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

  it("counts revenue from real payments and leaves virtual quotes out", async () => {
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
    const enrollmentId = enrolled.body.data.enrollmentId;
    seed.db.prepare("UPDATE enrollments SET pay_status='paid', pay_amount=199 WHERE id=?").run(enrollmentId);
    seed.db
      .prepare(
        "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene,refunded_amount) VALUES (?,?,?,?,?,?,?,?,?,?)"
      )
      .run(enrollmentId, seed.userId, seed.individualScheduleId, 80, "wechat", "success", "REV80", "自己支付", "enrollment", 0);
    const virtualId = Number(
      seed.db.prepare("INSERT INTO users (phone,nickname,is_virtual) VALUES (?,?,1)").run("13700009991", "虚拟甲").lastInsertRowid
    );
    seed.db
      .prepare(
        "INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,pay_status,pay_amount,status) VALUES (?,?,?,?,?,?,?)"
      )
      .run(seed.individualScheduleId, virtualId, "虚拟甲", "13700009991", "unpaid", 500, "joined");

    const list = await agent.get("/api/admin/schedules").set(auth(adminToken)).expect(200);
    const row = list.body.data.find((item) => item.id === seed.individualScheduleId);
    assert.equal(row.revenue, 80);
    assert.equal(row.virtualEnrolled, 1);
    assert.equal(row.profit, 80 - row.cost);

    const dash = await agent.get("/api/admin/dashboard").set(auth(adminToken)).expect(200);
    assert.equal(dash.body.data.revenue, 80);
    const line = dash.body.data.byRoute.find((item) => item.id === seed.routeId);
    assert.equal(line.revenue, 80);
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

    await agent.post(`/api/admin/routes/${id}/publish`).set(auth(adminToken)).expect(200);
    const relisted = await agent.get("/api/routes").expect(200);
    assert.equal(relisted.body.data.some((r) => r.code === "R99"), true);
  });

  it("does not shelf a pending or rejected application with the publish button", async () => {
    seed.db.prepare("UPDATE routes SET status='off', review_status='pending', submitted_by=1 WHERE id=?").run(seed.routeId);
    const pending = await agent.post(`/api/admin/routes/${seed.routeId}/publish`).set(auth(adminToken)).expect(400);
    assert.match(pending.body.message, /通过/);
    seed.db.prepare("UPDATE routes SET review_status='rejected' WHERE id=?").run(seed.routeId);
    const rejected = await agent.post(`/api/admin/routes/${seed.routeId}/publish`).set(auth(adminToken)).expect(400);
    assert.match(rejected.body.message, /驳回/);
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
    const listed = all.body.data.find((s) => s.id === scheduleId);
    assert.ok(listed);
    assert.equal(listed.route.story, undefined);
    assert.equal(listed.heat, undefined);
    const one = await agent.get(`/api/admin/schedules/${scheduleId}`).set(auth(adminToken)).expect(200);
    assert.ok(one.body.data.heat);

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

    const many = Array.from({ length: 13 }, (_, i) => `/static/uploads/g${i}.png`);
    await agent
      .put(`/api/admin/routes/${created.body.data.id}`)
      .set(auth(adminToken))
      .send({
        title: "带图线路",
        cover: res.body.data.url,
        gallery: many,
        priceTiers: [{ minPeople: 10, price: 199, memberPrice: 183 }],
        buses: ["bus30"],
      })
      .expect(200);
    const again = await agent.get("/api/admin/routes").set(auth(adminToken)).expect(200);
    const updated = again.body.data.find((r) => r.id === created.body.data.id);
    assert.equal(updated.gallery.length, 13);

    await agent.post("/api/admin/upload").set(auth(adminToken)).attach("file", Buffer.from("not-an-image"), "notes.txt").expect(400);
  });

  it("uploads an mp4 and the public detail can play it", async () => {
    const mp4 = Buffer.alloc(32);
    mp4.write("ftyp", 4, "ascii");
    const denied = await agent.post("/api/admin/videos").attach("file", mp4, "spot.mp4").expect(401);
    assert.equal(denied.body.ok, false);
    await agent.post("/api/admin/videos").set(auth(adminToken)).attach("file", Buffer.from("hello"), "note.txt").expect(400);

    const up = await agent.post("/api/admin/videos").set(auth(adminToken)).attach("file", mp4, "spot.mp4").expect(200);
    assert.match(up.body.data.url, /^\/static\/uploads\/adminv-.+\.mp4$/);

    const created = await agent
      .post("/api/admin/routes")
      .set(auth(adminToken))
      .send({
        title: "带视频线路",
        videos: [up.body.data.url],
        priceTiers: [{ minPeople: 10, price: 199, memberPrice: 183 }],
        buses: ["bus30"],
      })
      .expect(200);
    const detail = await agent.get(`/api/routes/${created.body.data.id}`).expect(200);
    assert.equal(detail.body.data.videos[0].kind, "video");
    assert.match(detail.body.data.videos[0].embedUrl, /\/static\/uploads\/adminv-.+\.mp4$/);

    const listed = await agent.get("/api/admin/routes").set(auth(adminToken)).expect(200);
    const row = listed.body.data.find((r) => r.id === created.body.data.id);
    assert.equal(row.videos[0].kind, "video");

    await agent
      .put(`/api/admin/routes/${created.body.data.id}`)
      .set(auth(adminToken))
      .send({
        title: "带视频线路",
        videos: [],
        priceTiers: [{ minPeople: 10, price: 199, memberPrice: 183 }],
        buses: ["bus30"],
      })
      .expect(200);
    const cleared = await agent.get(`/api/routes/${created.body.data.id}`).expect(200);
    assert.equal(cleared.body.data.videos.length, 0);
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
