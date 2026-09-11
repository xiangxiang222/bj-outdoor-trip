const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginAdmin, auth } = require("./http");

describe("admin review notices", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("pushes a campus notice that opens the verify page", async () => {
    const token = await loginUser(agent);
    const admin = await loginAdmin(agent);

    const empty = await agent.get("/api/admin/notices").set(auth(admin)).expect(200);
    assert.equal(empty.body.data.unread, 0);

    await agent.post("/api/me/student").set(auth(token)).send({ school: "北京大学", campusKind: "alumni" }).expect(200);

    const box = await agent.get("/api/admin/notices").set(auth(admin)).expect(200);
    assert.equal(box.body.data.unread, 1);
    assert.equal(box.body.data.list[0].kind, "campus");
    assert.equal(box.body.data.list[0].title, "校园认证待审");
    assert.match(box.body.data.list[0].body, /北京大学/);
    assert.match(box.body.data.list[0].body, /校友/);
    assert.equal(box.body.data.list[0].href, `/admin/verify?kind=campus&userId=${seed.userId}`);

    const pending = await agent.get("/api/admin/users?pending=campus").set(auth(admin)).expect(200);
    assert.equal(pending.body.data[0].id, seed.userId);
    assert.equal(pending.body.data[0].studentStatus, "pending");

    const read = await agent.post(`/api/admin/notices/${box.body.data.list[0].id}/read`).set(auth(admin)).expect(200);
    assert.equal(read.body.data.unread, false);
    assert.ok(read.body.data.readAt);

    const after = await agent.get("/api/admin/notices").set(auth(admin)).expect(200);
    assert.equal(after.body.data.unread, 0);
  });

  it("keeps one unread campus notice per user and clears it after approve", async () => {
    const token = await loginUser(agent);
    const admin = await loginAdmin(agent);
    await agent.post("/api/me/student").set(auth(token)).send({ school: "清华大学" }).expect(200);
    await agent.post("/api/me/student").set(auth(token)).send({ school: "清华大学" }).expect(200);
    const box = await agent.get("/api/admin/notices").set(auth(admin)).expect(200);
    assert.equal(box.body.data.unread, 1);

    await agent
      .post(`/api/admin/users/${seed.userId}/verify`)
      .set(auth(admin))
      .send({ kind: "student", action: "approve" })
      .expect(200);
    const after = await agent.get("/api/admin/notices").set(auth(admin)).expect(200);
    assert.equal(after.body.data.unread, 0);
  });

  it("notifies group certification and rejects a user token", async () => {
    const token = await loginUser(agent);
    const admin = await loginAdmin(agent);
    await agent.post("/api/me/group").set(auth(token)).send({ name: "北大山鹰社", kind: "社团" }).expect(200);
    const box = await agent.get("/api/admin/notices").set(auth(admin)).expect(200);
    assert.equal(box.body.data.list[0].kind, "group");
    assert.match(box.body.data.list[0].href, /\/admin\/verify\?kind=group/);
    const any = await agent.get("/api/admin/users?pending=any").set(auth(admin)).expect(200);
    assert.ok(any.body.data.some((u) => Number(u.id) === Number(seed.userId)));
    await agent.get("/api/admin/notices").set(auth(token)).expect(401);
  });
});
