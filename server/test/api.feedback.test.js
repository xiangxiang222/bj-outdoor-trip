const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginAdmin, auth } = require("./http");

describe("feedback inbox", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("stores a complaint with photos and notifies the admin inbox", async () => {
    const token = await loginUser(agent);
    const admin = await loginAdmin(agent);
    const short = await agent.post("/api/feedback").set(auth(token)).send({ kind: "trip", content: "短" });
    assert.equal(short.status, 400);

    const bad = await agent
      .post("/api/feedback")
      .set(auth(token))
      .send({ kind: "guide", content: "领队迟到了半小时", images: ["https://evil.example/a.jpg"] });
    assert.equal(bad.status, 400);

    const sent = await agent
      .post("/api/feedback")
      .set(auth(token))
      .send({
        kind: "safety",
        content: "下山路段没有人断后，希望下次安排。",
        images: ["/static/uploads/trail.jpg", "https://togetherbetter.cn/static/uploads/trail.jpg"],
      })
      .expect(200);
    assert.equal(sent.body.data.channel, "complaint");
    assert.equal(sent.body.data.label, "安全问题");

    const box = await agent.get("/api/admin/notices").set(auth(admin)).expect(200);
    assert.equal(box.body.data.list[0].kind, "feedback");
    assert.equal(box.body.data.list[0].title, "活动投诉");
    assert.equal(box.body.data.list[0].href, `/admin/feedback?id=${sent.body.data.id}`);
    assert.match(box.body.data.list[0].body, /安全问题/);

    const list = await agent.get("/api/admin/feedbacks?channel=complaint").set(auth(admin)).expect(200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].userId, seed.userId);
    assert.deepEqual(list.body.data[0].images, ["/static/uploads/trail.jpg"]);
    await agent.get("/api/admin/feedbacks").set(auth(token)).expect(401);
  });

  it("still accepts the old suggest and bug kinds", async () => {
    const token = await loginUser(agent);
    const admin = await loginAdmin(agent);
    await agent.post("/api/feedback").set(auth(token)).send({ kind: "suggest", content: "希望增加夜观星空" }).expect(200);
    await agent.post("/api/feedback").set(auth(token)).send({ kind: "bug", content: "收藏页打不开图片" }).expect(200);
    const tooLong = await agent.post("/api/feedback").set(auth(token)).send({ kind: "perf", content: "慢".repeat(201) });
    assert.equal(tooLong.status, 400);
    const list = await agent.get("/api/admin/feedbacks?channel=experience").set(auth(admin)).expect(200);
    assert.equal(list.body.data.length, 2);
    assert.equal(list.body.data[0].label, "找 BUG");
    const box = await agent.get("/api/admin/notices").set(auth(admin)).expect(200);
    assert.equal(box.body.data.unread, 2);
    assert.equal(box.body.data.list[0].title, "意见反馈");
  });
});
