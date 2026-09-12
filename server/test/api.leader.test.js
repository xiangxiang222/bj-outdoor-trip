const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginCompany, loginAdmin, applyAndApproveLeader, auth } = require("./http");

describe("personal leader application", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("blocks volunteer apply until admin approves the leader role", async () => {
    const token = await loginUser(agent);
    const blocked = await agent
      .post(`/api/schedules/${seed.individualScheduleId}/leaders/apply`)
      .set(auth(token))
      .expect(403);
    assert.equal(blocked.body.code, "need_leader_apply");
    assert.match(blocked.body.message, /领队申请/);

    const bad = await agent.post("/api/me/leader").set(auth(token)).send({ name: "周" }).expect(400);
    assert.match(bad.body.message, /真实姓名|经历|年限/);

    const submitted = await agent
      .post("/api/me/leader")
      .set(auth(token))
      .send({ name: "林领队", years: 3, intro: "带过慕田峪周末团，熟悉集合与车上节奏。" })
      .expect(200);
    assert.equal(submitted.body.data.isLeader, false);
    assert.equal(submitted.body.data.leaderStatus, "pending");
    assert.equal(submitted.body.data.role, "user");

    const pending = await agent
      .post(`/api/schedules/${seed.individualScheduleId}/leaders/apply`)
      .set(auth(token))
      .expect(403);
    assert.equal(pending.body.code, "leader_pending");

    const admin = await loginAdmin(agent);
    const inbox = await agent.get("/api/admin/notices").set(auth(admin)).expect(200);
    assert.equal(inbox.body.data.list[0].kind, "leader");
    assert.equal(inbox.body.data.list[0].href, `/admin/verify?kind=leader&userId=${seed.userId}`);

    const listed = await agent.get("/api/admin/users?pending=leader").set(auth(admin)).expect(200);
    assert.equal(listed.body.data[0].id, seed.userId);
    assert.equal(listed.body.data[0].leaderStatus, "pending");

    await agent
      .post(`/api/admin/users/${seed.userId}/verify`)
      .set(auth(admin))
      .send({ kind: "leader", action: "approve" })
      .expect(200);

    const me = await agent.get("/api/me").set(auth(token)).expect(200);
    assert.equal(me.body.data.isLeader, true);
    assert.equal(me.body.data.role, "leader");

    const after = await agent.get("/api/admin/notices").set(auth(admin)).expect(200);
    assert.equal(after.body.data.unread, 0);

    const again = await agent.post("/api/me/leader").set(auth(token)).send({
      name: "林领队",
      years: 3,
      intro: "带过慕田峪周末团，熟悉集合与车上节奏。",
    });
    assert.equal(again.status, 400);

    const applied = await agent
      .post(`/api/schedules/${seed.individualScheduleId}/leaders/apply`)
      .set(auth(token))
      .expect(200);
    assert.equal(applied.body.data.slot, 1);
  });

  it("keeps company role when a company account is approved as leader", async () => {
    const token = await loginCompany(agent);
    await applyAndApproveLeader(agent, token, seed.companyUserId, { name: "华创领队" });
    const me = await agent.get("/api/me").set(auth(token)).expect(200);
    assert.equal(me.body.data.isLeader, true);
    assert.equal(me.body.data.role, "company");
  });

  it("lets a rejected applicant submit again", async () => {
    const token = await loginUser(agent);
    const admin = await loginAdmin(agent);
    await agent
      .post("/api/me/leader")
      .set(auth(token))
      .send({ name: "林领队", years: 1, intro: "第一次申请领队，写清自己带过的线。" })
      .expect(200);
    await agent
      .post(`/api/admin/users/${seed.userId}/verify`)
      .set(auth(admin))
      .send({ kind: "leader", action: "reject" })
      .expect(200);
    const me = await agent.get("/api/me").set(auth(token)).expect(200);
    assert.equal(me.body.data.isLeader, false);
    assert.equal(me.body.data.leaderStatus, "rejected");
    const again = await agent
      .post("/api/me/leader")
      .set(auth(token))
      .send({ name: "林领队", years: 2, intro: "补上两次周末团经历后再提交申请。" })
      .expect(200);
    assert.equal(again.body.data.leaderStatus, "pending");
  });
});
