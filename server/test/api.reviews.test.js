const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, auth, ID, issueCaptcha } = require("./http");

describe("reviews", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
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
      });
  }

  it("rejects review unless the user has a joined seat", async () => {
    const token = await loginUser(agent);
    const missing = await agent.post("/api/reviews").set(auth(token)).send({ rating: 5, content: "好" });
    assert.equal(missing.status, 400);
    const noSeat = await agent
      .post("/api/reviews")
      .set(auth(token))
      .send({ scheduleId: seed.individualScheduleId, rating: 5, content: "好" });
    assert.equal(noSeat.status, 400);
    assert.match(noSeat.body.message, /报名成功/);
    await agent.get("/api/routes/999/reviews").expect(404);
    await agent.get("/api/schedules/999/reviews").expect(404);
  });

  it("accepts one review per trip and lists it on the route", async () => {
    const token = await loginUser(agent);
    await enroll(token).expect(200);
    const orders = await agent.get("/api/orders").set(auth(token)).expect(200);
    assert.equal(orders.body.data[0].canReview, true);
    assert.equal(orders.body.data[0].reviewed, false);

    const badRating = await agent
      .post("/api/reviews")
      .set(auth(token))
      .send({ scheduleId: seed.individualScheduleId, rating: 8 });
    assert.equal(badRating.status, 400);

    const created = await agent
      .post("/api/reviews")
      .set(auth(token))
      .send({ scheduleId: seed.individualScheduleId, rating: 5, content: "很好" })
      .expect(200);
    assert.equal(created.body.data.rating, 5);
    assert.match(created.body.data.name, /林/);

    const dup = await agent
      .post("/api/reviews")
      .set(auth(token))
      .send({ scheduleId: seed.individualScheduleId, rating: 4, content: "再评" });
    assert.equal(dup.status, 400);
    assert.match(dup.body.message, /已评价/);

    const after = await agent.get("/api/orders").set(auth(token)).expect(200);
    assert.equal(after.body.data[0].canReview, false);
    assert.equal(after.body.data[0].reviewed, true);

    const routeList = await agent.get(`/api/routes/${seed.routeId}/reviews`).expect(200);
    assert.equal(routeList.body.data.count, 1);
    assert.equal(routeList.body.data.avg, 5);
    assert.equal(routeList.body.data.list[0].content, "很好");

    const schList = await agent.get(`/api/schedules/${seed.individualScheduleId}/reviews`).expect(200);
    assert.equal(schList.body.data.count, 1);
  });

  it("blocks waitlisted and cancelled enrollments", async () => {
    seed.db.prepare("UPDATE schedules SET max_seats=1 WHERE id=?").run(seed.individualScheduleId);
    const token = await loginUser(agent);
    await enroll(token).expect(200);

    const cap = await issueCaptcha(agent);
    const other = await agent
      .post("/api/auth/register")
      .send({
        phone: "13600136009",
        password: "123456",
        nickname: "候补客",
        captchaToken: cap.token,
        captcha: cap.code,
      })
      .expect(200);
    const waitToken = other.body.data.token;
    const wait = await enroll(waitToken, {
      travelerName: "候补客",
      travelerPhone: "13600136009",
      idCard: ID.femaleBj,
    }).expect(200);
    assert.equal(wait.body.data.waitlisted, true);
    const denied = await agent
      .post("/api/reviews")
      .set(auth(waitToken))
      .send({ scheduleId: seed.individualScheduleId, rating: 5, content: "候补也想评" });
    assert.equal(denied.status, 400);

    const cancelled = await agent.post(`/api/orders/${wait.body.data.enrollmentId}/cancel`).set(auth(waitToken)).expect(200);
    assert.ok(cancelled.body.ok);
    const afterCancel = await agent
      .post("/api/reviews")
      .set(auth(waitToken))
      .send({ scheduleId: seed.individualScheduleId, rating: 4 });
    assert.equal(afterCancel.status, 400);
  });
});
