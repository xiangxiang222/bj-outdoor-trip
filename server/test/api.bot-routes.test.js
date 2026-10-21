const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const { harness, loginAdmin, loginUser, auth } = require("./http");
const { ingestRoute } = require("../src/services/route-bot");

const TOKEN = "bot-test-token";

function botAuth() {
  return { Authorization: `Bearer ${TOKEN}` };
}

function body(extra = {}) {
  return {
    title: "金海湖环湖",
    region: "北京市 / 平谷区",
    days: 1,
    sourceKey: "jinhaihu",
    sourceUrl: "https://www.jinhaihujingqu.com/",
    suggestedPrice: 128,
    description: "环湖步道和游船",
    highlights: ["湖面开阔", "可看坝体"],
    itinerary: [{ time: "08:00", title: "集合", detail: "东直门" }],
    photoSources: [{ url: "https://example.com/lake.jpg", caption: "湖面" }],
    cover: "https://example.com/cover.jpg",
    ...extra,
  };
}

describe("bot route ingest", () => {
  let agent;
  let seed;
  let previous;

  beforeEach(() => {
    previous = process.env.BOT_INGEST_TOKEN;
    process.env.BOT_INGEST_TOKEN = TOKEN;
    ({ agent, seed } = harness());
  });

  afterEach(() => {
    if (previous == null) delete process.env.BOT_INGEST_TOKEN;
    else process.env.BOT_INGEST_TOKEN = previous;
  });

  it("stays closed without a token and rejects a bad token", async () => {
    delete process.env.BOT_INGEST_TOKEN;
    const closed = await agent.post("/api/bot/routes").set(botAuth()).send(body()).expect(503);
    assert.match(closed.body.message, /未开启/);
    process.env.BOT_INGEST_TOKEN = TOKEN;
    const denied = await agent.post("/api/bot/routes").set({ Authorization: "Bearer wrong" }).send(body()).expect(401);
    assert.match(denied.body.message, /密钥/);
    await agent.post("/api/bot/routes?token=" + TOKEN).send(body()).expect(401);
  });

  it("stores a pending draft off the catalog and merges repeats", async () => {
    const missing = await agent.post("/api/bot/routes").set(botAuth()).send({ title: "金" }).expect(400);
    assert.match(missing.body.message, /标题|地区/);

    const admin = await loginAdmin(agent);
    const created = await agent.post("/api/bot/routes").set(botAuth()).send(body()).expect(200);
    const id = created.body.data.id;
    assert.equal(created.body.data.reviewStatus, "pending");
    assert.equal(created.body.data.status, "off");
    assert.equal(created.body.data.updated, true);
    assert.equal(created.body.data.suggestedPrice, 128);
    assert.equal(created.body.data.photoSources[0].url, "https://example.com/lake.jpg");

    await agent.get(`/api/routes/${id}`).expect(404);
    const listed = await agent.get("/api/routes").expect(200);
    assert.equal(listed.body.data.some((row) => row.id === id), false);

    const user = await loginUser(agent);
    const blocked = await agent.post("/api/schedules").set(auth(user)).send({
      routeId: id,
      startDate: dayjs().add(12, "day").format("YYYY-MM-DD"),
      busTypeId: "coaster10",
      minGroupSize: 1,
      meetupPoint: "东直门",
    });
    assert.equal(blocked.status, 400);

    const shelf = await agent.post(`/api/admin/routes/${id}/publish`).set(auth(admin)).expect(400);
    assert.match(shelf.body.message, /通过/);

    const pending = await agent.get("/api/admin/routes?review=pending").set(auth(admin)).expect(200);
    const row = pending.body.data.find((item) => item.id === id);
    assert.equal(row.source, "bot");
    assert.equal(row.cover, "");
    assert.equal(row.bountyAmount, 0);
    assert.equal(row.suggestedPrice, 128);
    assert.equal(row.highlights[0], "湖面开阔");

    const inbox = await agent.get("/api/admin/notices").set(auth(admin)).expect(200);
    assert.equal(inbox.body.data.list[0].title, "机器采集待审");

    const again = await agent
      .post("/api/bot/routes")
      .set(botAuth())
      .send(body({ subtitle: "可坐船", title: "金海湖环湖一日" }))
      .expect(200);
    assert.equal(again.body.data.id, id);
    assert.equal(again.body.data.updated, true);
    const looked = await agent.get(`/api/bot/routes/${id}`).set(botAuth()).expect(200);
    assert.equal(looked.body.data.title, "金海湖环湖一日");
    const still = await agent.get("/api/admin/routes?review=pending").set(auth(admin)).expect(200);
    assert.equal(still.body.data.filter((item) => item.sourceKey === "jinhaihu").length, 1);

    const official = await agent
      .post(`/api/admin/routes/${seed.routeId}/review`)
      .set(auth(admin))
      .send({ action: "approve" })
      .expect(400);
    assert.match(official.body.message, /上下架/);
  });

  it("publishes only after review and does not overwrite a live route", async () => {
    const admin = await loginAdmin(agent);
    const created = await agent.post("/api/bot/routes").set(botAuth()).send(body()).expect(200);
    const id = created.body.data.id;
    const approved = await agent
      .post(`/api/admin/routes/${id}/review`)
      .set(auth(admin))
      .send({ action: "approve" })
      .expect(200);
    assert.equal(approved.body.data.reviewStatus, "approved");
    assert.equal(approved.body.data.status, "on");
    assert.equal(approved.body.data.bountyAmount, 0);

    const listed = await agent.get("/api/routes").expect(200);
    assert.equal(listed.body.data.some((row) => row.id === id), true);
    const detail = await agent.get(`/api/routes/${id}`).expect(200);
    assert.equal(detail.body.data.photoSources, undefined);

    const held = await agent
      .post("/api/bot/routes")
      .set(botAuth())
      .send(body({ title: "不该覆盖" }))
      .expect(200);
    assert.equal(held.body.data.updated, false);
    assert.equal(held.body.data.title, "金海湖环湖");

    const saved = seed.db.prepare("SELECT bounty_status, bounty_amount, status FROM routes WHERE id=?").get(id);
    assert.equal(saved.bounty_status, "");
    assert.equal(saved.bounty_amount, 0);
    assert.equal(saved.status, "on");
  });

  it("lets a rejected draft be submitted again", async () => {
    const admin = await loginAdmin(agent);
    const created = await agent.post("/api/bot/routes").set(botAuth()).send(body()).expect(200);
    const id = created.body.data.id;
    await agent.post(`/api/admin/routes/${id}/review`).set(auth(admin)).send({ action: "reject", note: "图片不够" }).expect(200);
    const hidden = await agent.get("/api/routes").expect(200);
    assert.equal(hidden.body.data.some((row) => row.id === id), false);

    const again = await agent.post("/api/bot/routes").set(botAuth()).send(body({ description: "补了开放时间" })).expect(200);
    assert.equal(again.body.data.id, id);
    assert.equal(again.body.data.reviewStatus, "pending");
    assert.equal(again.body.data.status, "off");
    const looked = await agent.get("/api/bot/routes/jinhaihu").set(botAuth()).expect(200);
    assert.equal(looked.body.data.reviewNote, "图片不够");
  });

  it("saves reported photos and lists rejection notes for the bot", async () => {
    const admin = await loginAdmin(agent);
    const jpeg = Buffer.alloc(9000, 7);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    jpeg[2] = 0xff;
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(String(url));
      return { ok: true, arrayBuffer: async () => jpeg };
    };

    const saved = await ingestRoute(
      body({
        sourceKey: "photo-lake",
        photoSources: [{ url: "https://img.example.com/lake.jpg", caption: "湖面" }],
      }),
      { fetchImpl }
    );
    const row = seed.db.prepare("SELECT cover, gallery_json FROM routes WHERE id=?").get(saved.id);
    assert.match(row.cover, /^\/static\/uploads\/bot-.+\.jpg$/);
    assert.equal(JSON.parse(row.gallery_json)[0], row.cover);

    urls.length = 0;
    const bare = await ingestRoute(
      body({
        sourceKey: "photo-beiling",
        title: "门头沟北灵山高山草甸徒步",
        photoSources: [{ url: "http://127.0.0.1/secret.jpg" }],
      }),
      { fetchImpl }
    );
    assert.equal(urls.length, 0);
    const empty = seed.db.prepare("SELECT cover FROM routes WHERE id=?").get(bare.id);
    assert.equal(empty.cover, "");

    const missing = await agent
      .post(`/api/admin/routes/${saved.id}/review`)
      .set(auth(admin))
      .send({ action: "reject", note: "  " })
      .expect(400);
    assert.match(missing.body.message, /修改意见/);

    await agent
      .post(`/api/admin/routes/${saved.id}/review`)
      .set(auth(admin))
      .send({ action: "reject", note: "封面换成湖面实景" })
      .expect(200);
    const inbox = await agent.get("/api/bot/routes?review=rejected").set(botAuth()).expect(200);
    const item = inbox.body.data.find((row) => row.sourceKey === "photo-lake");
    assert.equal(item.reviewNote, "封面换成湖面实景");
    assert.equal(item.reviewStatus, "rejected");

    const again = await agent.post("/api/bot/routes").set(botAuth()).send(body({ sourceKey: "photo-lake", description: "补了实景" })).expect(200);
    assert.equal(again.body.data.reviewStatus, "pending");
    const left = await agent.get("/api/bot/routes?review=rejected").set(botAuth()).expect(200);
    assert.equal(left.body.data.some((row) => row.sourceKey === "photo-lake"), false);
    const looked = await agent.get("/api/bot/routes/photo-lake").set(botAuth()).expect(200);
    assert.equal(looked.body.data.reviewNote, "封面换成湖面实景");
  });
});
