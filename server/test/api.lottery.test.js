const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const { harness, loginUser, loginAdmin, auth, ID, issueCaptcha } = require("./http");

describe("lottery after-trip contest", () => {
  let agent;
  let seed;
  const originalRandom = Math.random;

  beforeEach(() => {
    ({ agent, seed } = harness());
    Math.random = originalRandom;
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  function enroll(token, extra = {}) {
    return agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: seed.individualScheduleId,
        travelerName: extra.travelerName || "林北野",
        travelerPhone: extra.travelerPhone || "13800138000",
        idCard: extra.idCard || ID.maleBj,
        emergencyName: "紧急联系人",
        emergencyPhone: "13700000002",
        waiverAccepted: true,
        healthOk: true,
        ...extra,
      });
  }

  async function register(phone, nickname, idCard) {
    const cap = await issueCaptcha(agent);
    const res = await agent
      .post("/api/auth/register")
      .send({
        phone,
        password: "123456",
        nickname,
        captchaToken: cap.token,
        captcha: cap.code,
      })
      .expect(200);
    return res.body.data.token;
  }

  it("lets a user draw once before the trip", async () => {
    const token = await loginUser(agent);
    Math.random = () => 0.37;
    const first = await agent.post("/api/lottery/draw").set(auth(token)).send({ phase: "pre" }).expect(200);
    assert.equal(first.body.data.prizeKey, "points20");
    assert.equal(first.body.data.already, undefined);
    const again = await agent.post("/api/lottery/draw").set(auth(token)).send({ phase: "pre", scheduleId: seed.individualScheduleId }).expect(200);
    assert.equal(again.body.data.already, true);
    assert.equal(again.body.data.prizeKey, "points20");
    const state = await agent.get("/api/lottery").set(auth(token)).expect(200);
    assert.equal(state.body.data.canPre, false);
    assert.equal(state.body.data.pre.prizeKey, "points20");
  });

  it("blocks complete and second draw until the trip day after joining", async () => {
    const token = await loginUser(agent);
    const early = await agent.post(`/api/schedules/${seed.individualScheduleId}/complete`).set(auth(token));
    assert.equal(early.status, 400);
    await enroll(token).expect(200);
    const beforeDay = await agent.post(`/api/schedules/${seed.individualScheduleId}/complete`).set(auth(token));
    assert.equal(beforeDay.status, 400);
    assert.match(beforeDay.body.message, /还没开始/);
    const postEarly = await agent
      .post("/api/lottery/draw")
      .set(auth(token))
      .send({ phase: "post", scheduleId: seed.individualScheduleId });
    assert.equal(postEarly.status, 400);
    const orders = await agent.get("/api/orders").set(auth(token)).expect(200);
    assert.equal(orders.body.data[0].canComplete, false);
    assert.equal(orders.body.data[0].completed, false);
  });

  it("completes the trip then allows review, second draw and contest vote", async () => {
    const token = await loginUser(agent);
    await enroll(token).expect(200);
    seed.db.prepare("UPDATE schedules SET start_date=? WHERE id=?").run(dayjs().format("YYYY-MM-DD"), seed.individualScheduleId);

    const ready = await agent.get("/api/orders").set(auth(token)).expect(200);
    assert.equal(ready.body.data[0].canComplete, true);

    const done = await agent.post(`/api/schedules/${seed.individualScheduleId}/complete`).set(auth(token)).expect(200);
    assert.equal(done.body.data.already, false);
    const again = await agent.post(`/api/schedules/${seed.individualScheduleId}/complete`).set(auth(token)).expect(200);
    assert.equal(again.body.data.already, true);

    const after = await agent.get(`/api/schedules/${seed.individualScheduleId}/after`).set(auth(token)).expect(200);
    assert.equal(after.body.data.completed, true);
    assert.equal(after.body.data.canComplete, false);
    assert.equal(after.body.data.lottery.canPost, true);

    Math.random = () => 0.37;
    await agent.post("/api/lottery/draw").set(auth(token)).send({ phase: "pre" }).expect(200);
    Math.random = () => 0.37;
    const post = await agent
      .post("/api/lottery/draw")
      .set(auth(token))
      .send({ phase: "post", scheduleId: seed.individualScheduleId })
      .expect(200);
    assert.equal(post.body.data.prizeKey, "points20");
    assert.equal(post.body.data.matched, true);
    assert.equal(post.body.data.doubled, true);

    const contestEarly = await agent
      .post(`/api/schedules/${seed.individualScheduleId}/contest`)
      .set(auth(token))
      .send({ url: "not-a-url", caption: "今天" });
    assert.equal(contestEarly.status, 400);

    const mine = await agent
      .post(`/api/schedules/${seed.individualScheduleId}/contest`)
      .set(auth(token))
      .send({ url: "https://www.xiaohongshu.com/explore/abc", caption: "长城日落" })
      .expect(200);
    assert.equal(mine.body.data.votes, 0);

    const selfVote = await agent.post(`/api/contest/${mine.body.data.id}/vote`).set(auth(token));
    assert.equal(selfVote.status, 400);

    const other = await register("13600136008", "投票客", ID.femaleBj);
    await enroll(other, {
      travelerName: "投票客",
      travelerPhone: "13600136008",
      idCard: ID.femaleBj,
    }).expect(200);
    const voted = await agent.post(`/api/contest/${mine.body.data.id}/vote`).set(auth(other)).expect(200);
    assert.equal(voted.body.data[0].votes, 1);
    assert.equal(voted.body.data[0].voted, true);
  });

  it("lets admin configure per-trip prizes, rates and a designated winner", async () => {
    const admin = await loginAdmin(agent);
    const token = await loginUser(agent);
    const sid = seed.individualScheduleId;
    const saved = await agent
      .put(`/api/admin/schedules/${sid}/lottery`)
      .set(auth(admin))
      .send({
        enabled: true,
        title: "坝上抽奖",
        spinSeconds: 5,
        prizes: [
          { name: "一等奖", level: 1, kind: "physical", weight: 1, stock: 1, color: "#e1251b", prizeKey: "first" },
          { name: "二等奖", level: 2, kind: "points", points: 50, weight: 9, stock: -1, color: "#f5a623", prizeKey: "second" },
          { name: "谢谢参与", level: 9, kind: "thanks", weight: 90, stock: -1, color: "#c8ccc4", prizeKey: "thanks" },
        ],
      })
      .expect(200);
    assert.equal(saved.body.data.enabled, true);
    assert.equal(saved.body.data.prizes.length, 3);
    assert.equal(saved.body.data.prizes[0].rate, 1);
    const firstId = saved.body.data.prizes[0].id;

    await agent
      .post(`/api/admin/schedules/${sid}/lottery/assigns`)
      .set(auth(admin))
      .send({ phone: "13800138000", prizeId: firstId, note: "指定一等奖" })
      .expect(200);

    Math.random = () => 0.99;
    const drawn = await agent.post("/api/lottery/draw").set(auth(token)).send({ phase: "pre", scheduleId: sid }).expect(200);
    assert.equal(drawn.body.data.prizeKey, "first");
    assert.equal(drawn.body.data.prizeLabel, "一等奖");
    assert.equal(drawn.body.data.level, 1);
    assert.equal(drawn.body.data.sectorIndex, 0);
    assert.equal(drawn.body.data.spinSeconds, 5);
    assert.equal(drawn.body.data.assigned, undefined);

    const state = await agent.get("/api/lottery").set(auth(token)).query({ scheduleId: sid }).expect(200);
    assert.equal(state.body.data.title, "坝上抽奖");
    assert.equal(state.body.data.canPre, false);
    assert.equal(state.body.data.prizes[0].label, "一等奖");
    assert.equal(state.body.data.prizes[0].weight, undefined);

    const adminView = await agent.get(`/api/admin/schedules/${sid}/lottery`).set(auth(admin)).expect(200);
    assert.equal(adminView.body.data.draws[0].assigned, true);
    assert.equal(adminView.body.data.assigns[0].usedAt.length > 0, true);
  });

  it("falls back when a limited prize is gone", async () => {
    const admin = await loginAdmin(agent);
    const token = await loginUser(agent);
    const other = await register("13600136009", "第二人", ID.femaleSd);
    const sid = seed.individualScheduleId;
    await agent
      .put(`/api/admin/schedules/${sid}/lottery`)
      .set(auth(admin))
      .send({
        enabled: true,
        spinSeconds: 4,
        prizes: [
          { name: "仅一份", level: 1, kind: "physical", weight: 100, stock: 1, prizeKey: "only" },
          { name: "谢谢参与", level: 9, kind: "thanks", weight: 0, stock: -1, prizeKey: "thanks" },
        ],
      })
      .expect(200);
    Math.random = () => 0.1;
    const first = await agent.post("/api/lottery/draw").set(auth(token)).send({ phase: "pre", scheduleId: sid }).expect(200);
    assert.equal(first.body.data.prizeKey, "only");
    const second = await agent.post("/api/lottery/draw").set(auth(other)).send({ phase: "pre", scheduleId: sid }).expect(200);
    assert.equal(second.body.data.prizeKey, "thanks");
  });
});
