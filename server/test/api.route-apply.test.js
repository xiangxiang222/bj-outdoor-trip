const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const { getDb } = require("../src/db");
const { harness, loginUser, loginAdmin, auth, ID, enrollPayload } = require("./http");

function applyBody(extra = {}) {
  return {
    title: "雾灵山观景台",
    region: "北京市 / 密云区",
    days: 1,
    minGroupSize: 1,
    originPrice: 188,
    description: "秋色和云海",
    contactPhone: "13800138000",
    contactWechat: "linbeiye",
    ...extra,
  };
}

describe("route apply and bounty", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("exposes bounty on meta and requires contact to apply", async () => {
    const meta = await agent.get("/api/meta").expect(200);
    assert.equal(meta.body.data.routeBounty, 300);
    assert.ok(meta.body.data.faqs.some((f) => /收录/.test(f.q)));
    await agent.post("/api/routes/apply").send(applyBody()).expect(401);
    const token = await loginUser(agent);
    const blank = await agent.post("/api/routes/apply").set(auth(token)).send({ title: "雾灵山" }).expect(400);
    assert.match(blank.body.message, /地区/);
    const noWx = await agent.post("/api/routes/apply").set(auth(token)).send(applyBody({ contactWechat: "" })).expect(400);
    assert.match(noWx.body.message, /微信/);
  });

  it("hides pending applications until approved and notifies admin", async () => {
    const token = await loginUser(agent);
    const admin = await loginAdmin(agent);
    const created = await agent.post("/api/routes/apply").set(auth(token)).send(applyBody()).expect(200);
    const id = created.body.data.id;
    assert.equal(created.body.data.reviewStatus, "pending");
    assert.equal(created.body.data.bountyAmount, 300);
    assert.match(created.body.data.message, /同行者众/);
    assert.equal(created.body.data.contacts.officialWechat, "同行者众");

    await agent.get(`/api/routes/${id}`).expect(404);
    const mine = await agent.get(`/api/routes/${id}`).set(auth(token)).expect(200);
    assert.equal(mine.body.data.reviewStatus, "pending");
    assert.equal(mine.body.data.contactWechat, "linbeiye");
    const listed = await agent.get("/api/routes").expect(200);
    assert.equal(listed.body.data.some((r) => r.id === id), false);

    const apps = await agent.get("/api/routes/apps").set(auth(token)).expect(200);
    assert.equal(apps.body.data.list[0].id, id);
    assert.equal(apps.body.data.bounty, 300);

    const start = dayjs().add(12, "day").format("YYYY-MM-DD");
    const blocked = await agent.post("/api/schedules").set(auth(token)).send({
      routeId: id,
      startDate: start,
      busTypeId: "coaster10",
      minGroupSize: 1,
      meetupPoint: "东直门东方银座C口",
    });
    assert.equal(blocked.status, 400);
    assert.match(blocked.body.message, /审核/);

    const inbox = await agent.get("/api/admin/notices").set(auth(admin)).expect(200);
    assert.equal(inbox.body.data.list[0].kind, "route");
    assert.match(inbox.body.data.list[0].href, new RegExp(`/admin/routes\\?review=pending&id=${id}`));

    const pending = await agent.get("/api/admin/routes?review=pending").set(auth(admin)).expect(200);
    const row = pending.body.data.find((r) => r.id === id);
    assert.ok(row);
    assert.equal(row.contactPhone, "13800138000");
    assert.equal(row.applicantName, "林北野");

    await agent
      .put(`/api/admin/routes/${id}`)
      .set(auth(admin))
      .send({
        title: "雾灵山观景台",
        subtitle: "",
        days: 1,
        distanceKm: 0,
        difficulty: "休闲",
        category: "山水",
        region: "北京市 / 密云区",
        season: "四季",
        tags: [],
        cover: "",
        gallery: [],
        minGroupSize: 1,
        description: "秋色和云海",
        highlights: [],
        itinerary: [],
        feeInclude: "",
        feeExclude: "",
        equipment: "",
        notices: "",
        meetupPoints: [],
        status: "on",
      })
      .expect(200);
    await agent.get(`/api/routes/${id}`).expect(404);

    const official = await agent
      .post(`/api/admin/routes/${seed.routeId}/review`)
      .set(auth(admin))
      .send({ action: "approve" })
      .expect(400);
    assert.match(official.body.message, /官方/);

    const dup = await agent.post("/api/routes/apply").set(auth(token)).send(applyBody()).expect(400);
    assert.match(dup.body.message, /在审/);
  });

  it("pays 300 once after approve and first real 成团", async () => {
    const token = await loginUser(agent);
    const admin = await loginAdmin(agent);
    const created = await agent.post("/api/routes/apply").set(auth(token)).send(applyBody()).expect(200);
    const id = created.body.data.id;
    const reviewed = await agent
      .post(`/api/admin/routes/${id}/review`)
      .set(auth(admin))
      .send({ action: "approve" })
      .expect(200);
    assert.equal(reviewed.body.data.reviewStatus, "approved");
    const publicRow = await agent.get(`/api/routes/${id}`).expect(200);
    assert.equal(publicRow.body.data.title, "雾灵山观景台");
    const after = await agent.get("/api/admin/notices").set(auth(admin)).expect(200);
    assert.equal(after.body.data.unread, 0);

    const start = dayjs().add(12, "day").format("YYYY-MM-DD");
    const sch = await agent
      .post("/api/schedules")
      .set(auth(token))
      .send({
        routeId: id,
        startDate: start,
        busTypeId: "coaster10",
        minGroupSize: 1,
        meetupPoint: "东直门东方银座C口",
      })
      .expect(200);
    const joined = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: sch.body.data.id,
        travelerName: "林北野",
        travelerPhone: "13800138000",
        idCard: ID.maleBj,
        ...enrollPayload(),
      })
      .expect(200);
    const unpaid = getDb()
      .prepare("SELECT * FROM payments WHERE scene='route_bounty' AND user_id=?")
      .all(seed.userId);
    assert.equal(unpaid.length, 0);
    await agent
      .post("/api/pay/for-enrollment")
      .set(auth(token))
      .send({ enrollmentId: joined.body.data.enrollmentId })
      .expect(200);
    const pays = getDb()
      .prepare("SELECT * FROM payments WHERE scene='route_bounty' AND user_id=?")
      .all(seed.userId);
    assert.equal(pays.length, 1);
    assert.equal(pays[0].amount, 300);
    assert.equal(pays[0].status, "success");
    const route = getDb().prepare("SELECT * FROM routes WHERE id=?").get(id);
    assert.equal(route.bounty_status, "paid");
    require("../src/services/helpers").maybeMatchGuide(sch.body.data.id);
    const again = getDb().prepare("SELECT COUNT(*) AS c FROM payments WHERE scene='route_bounty' AND user_id=?").get(seed.userId);
    assert.equal(again.c, 1);
  });

  it("does not pay bounty after reject", async () => {
    const token = await loginUser(agent);
    const admin = await loginAdmin(agent);
    const created = await agent
      .post("/api/routes/apply")
      .set(auth(token))
      .send(applyBody({ title: "百花山夜路" }))
      .expect(200);
    await agent
      .post(`/api/admin/routes/${created.body.data.id}/review`)
      .set(auth(admin))
      .send({ action: "reject", note: "路况不适合夜走" })
      .expect(200);
    await agent.get(`/api/routes/${created.body.data.id}`).expect(404);
    const mine = await agent.get(`/api/routes/${created.body.data.id}`).set(auth(token)).expect(200);
    assert.equal(mine.body.data.reviewStatus, "rejected");
    assert.match(mine.body.data.reviewNote, /路况/);
    const blocked = await agent.post("/api/schedules").set(auth(token)).send({
      routeId: created.body.data.id,
      startDate: dayjs().add(8, "day").format("YYYY-MM-DD"),
      busTypeId: "coaster10",
    });
    assert.equal(blocked.status, 400);
    const pays = getDb().prepare("SELECT COUNT(*) AS c FROM payments WHERE scene='route_bounty'").get();
    assert.equal(pays.c, 0);
  });
});
