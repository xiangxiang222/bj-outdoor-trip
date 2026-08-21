const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, auth } = require("./http");

describe("routes and schedules API", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("lists buses and guides", async () => {
    const buses = await agent.get("/api/buses").expect(200);
    assert.ok(buses.body.data.some((b) => b.id === "coaster10"));
    const guides = await agent.get("/api/guides").expect(200);
    const peak = guides.body.data.find((g) => g.name === "林晓峰");
    assert.ok(peak);
    assert.ok(peak.bio);
    assert.equal(peak.phone, undefined);
    assert.ok(peak.languages);
    const detail = await agent.get(`/api/guides/${peak.id}`).expect(200);
    assert.equal(detail.body.data.name, "林晓峰");
    assert.ok(Array.isArray(detail.body.data.upcoming));
    assert.equal(typeof detail.body.data.tripCount, "number");
    await agent.get("/api/guides/99999").expect(404);
  });

  it("filters routes by days and keyword", async () => {
    const all = await agent.get("/api/routes").expect(200);
    assert.equal(all.body.data.length, 1);
    const byDay = await agent.get("/api/routes?days=1").expect(200);
    assert.equal(byDay.body.data.length, 1);
    const none = await agent.get("/api/routes?days=5").expect(200);
    assert.equal(none.body.data.length, 0);
    const q = await agent.get("/api/routes?q=慕田峪").expect(200);
    assert.equal(q.body.data[0].code, "R01");
    const cat = await agent.get("/api/routes?category=长城&difficulty=休闲").expect(200);
    assert.equal(cat.body.data.length, 1);
  });

  it("returns route detail, 404, and favored flag", async () => {
    await agent.get("/api/routes/99999").expect(404);
    const token = await loginUser(agent);
    await agent.post(`/api/favorites/${seed.routeId}`).set(auth(token)).expect(200);
    const detail = await agent.get(`/api/routes/${seed.routeId}`).set(auth(token)).expect(200);
    assert.equal(detail.body.data.favored, true);
    assert.ok(detail.body.data.priceTiers.length >= 1);
    assert.ok(detail.body.data.schedules.length >= 1);
  });

  it("lists and details schedules with masked chain names", async () => {
    const list = await agent.get("/api/schedules").expect(200);
    assert.ok(list.body.data.length >= 2);
    const byRoute = await agent.get(`/api/schedules?routeId=${seed.routeId}`).expect(200);
    assert.ok(byRoute.body.data.every((s) => s.routeId === seed.routeId));
    const company = await agent.get("/api/schedules?organizerType=company").expect(200);
    assert.equal(company.body.data.every((s) => s.organizerType === "company"), true);
    const token = await loginUser(agent);
    await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: "110101199205121219",
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    });
    const detail = await agent.get(`/api/schedules/${seed.individualScheduleId}`).expect(200);
    assert.equal(detail.body.data.chain[0].name, "林**");
    await agent.get("/api/schedules/99999").expect(404);
  });

  it("share token redirects; invalid token 404", async () => {
    const res = await agent.get("/api/share/shareind01").redirects(0);
    assert.equal(res.status, 302);
    assert.match(res.headers.location, /\/m\/schedule\//);
    await agent.get("/api/share/no-such-token").expect(404);
  });

  it("creates individual and company schedules", async () => {
    const token = await loginUser(agent);
    await agent.post("/api/schedules").set(auth(token)).send({}).expect(400);
    const ok = await agent
      .post("/api/schedules")
      .set(auth(token))
      .send({
        routeId: seed.routeId,
        startDate: "2099-08-01",
        busTypeId: "coaster10",
        organizerType: "individual",
        meetupPoint: "东直门东方银座C口",
      })
      .expect(200);
    assert.equal(ok.body.data.status, "recruiting");
    assert.equal(ok.body.data.maxSeats, 10);

    const companyToken = await loginUser(agent, "13900139000");
    const company = await agent
      .post("/api/schedules")
      .set(auth(companyToken))
      .send({
        routeId: seed.routeId,
        startDate: "2099-09-01",
        busTypeId: "bus30",
        organizerType: "company",
      })
      .expect(200);
    assert.equal(company.body.data.organizerType, "company");

    const noCompany = await agent
      .post("/api/schedules")
      .set(auth(token))
      .send({
        routeId: seed.routeId,
        startDate: "2099-10-01",
        busTypeId: "bus30",
        organizerType: "company",
      });
    assert.equal(noCompany.status, 400);
  });

  it("returns poster qr", async () => {
    const res = await agent.get(`/api/schedules/${seed.individualScheduleId}/poster`).expect(200);
    assert.match(res.body.data.qr, /^data:image\/png;base64,/);
    assert.match(res.body.data.url, /\/m\/schedule\//);
    await agent.get("/api/schedules/99999/poster").expect(404);
  });
});
