const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const { harness, loginUser, loginAdmin, auth, ID, enrollPayload } = require("./http");
const { cityHint, relativeTime, displayWho, formatItem, parseVisitorId } = require("../src/services/pulse");

describe("live pulse helpers", () => {
  it("masks names and city, formats relative time and ticker copy", () => {
    assert.equal(cityHint("北京市"), "北京");
    assert.equal(cityHint("河北省石家庄市"), "石家庄");
    assert.equal(cityHint(""), "");
    const now = dayjs("2026-09-13 12:00:00");
    assert.equal(relativeTime("2026-09-13 11:57:00", now), "3 分钟前");
    assert.equal(relativeTime("2026-09-13 11:59:30", now), "刚刚");
    assert.equal(relativeTime("2026-09-13 10:00:00", now), "2 小时前");
    assert.equal(relativeTime("2026-09-12 12:00:00", now), "昨天");
    const who = displayWho({ nickname: "林北野", hometown: "北京市" });
    assert.equal(who.who, "林**");
    assert.equal(who.place, "北京");
    assert.match(
      formatItem({ kind: "enroll", who: "林**", place: "北京", timeAgo: "3 分钟前", title: "慕田峪长城缆车一日游" }),
      /林\*\*（北京）3 分钟前报名了慕田峪/
    );
    assert.match(formatItem({ kind: "view", who: "一位同行", timeAgo: "刚刚", title: "慕田峪长城缆车一日游" }), /浏览了/);
    assert.match(formatItem({ kind: "review", who: "林**", timeAgo: "昨天", title: "慕田峪", rating: 5 }), /评了 5 分/);
    assert.equal(parseVisitorId("abc"), parseVisitorId("abc"));
    assert.match(parseVisitorId("visitor-ok-01"), /visitor-ok-01/);
  });
});

describe("live pulse API", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  function enroll(token, extra = {}) {
    return agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: ID.maleBj,
      ...enrollPayload(),
      ...extra,
    });
  }

  it("lists a recent enrollment on home and hides full names", async () => {
    const token = await loginUser(agent);
    await enroll(token).expect(200);
    const pulse = await agent.get("/api/live/pulse").set({ "X-Visitor-Id": "guest-home-01" }).expect(200);
    const hit = pulse.body.data.items.find((it) => it.kind === "enroll");
    assert.ok(hit);
    assert.equal(hit.who, "林**");
    assert.match(hit.text, /报名了慕田峪/);
    assert.equal(hit.scheduleId, seed.individualScheduleId);
    assert.doesNotMatch(JSON.stringify(pulse.body.data), /林北野/);
    assert.equal(hit.href, `/m/schedule/${seed.individualScheduleId}`);
  });

  it("scopes route pulse and records named views with throttle", async () => {
    const token = await loginUser(agent);
    await enroll(token).expect(200);
    await agent.post(`/api/favorites/${seed.routeId}`).set(auth(token)).expect(200);
    const view = await agent
      .post("/api/live/view")
      .set({ ...auth(token), "X-Visitor-Id": "user-view-aa" })
      .send({ scope: "route", routeId: seed.routeId })
      .expect(200);
    assert.equal(view.body.data.recorded, true);
    const again = await agent
      .post("/api/live/view")
      .set({ ...auth(token), "X-Visitor-Id": "user-view-aa" })
      .send({ scope: "route", routeId: seed.routeId })
      .expect(200);
    assert.equal(again.body.data.recorded, false);

    const other = await agent
      .get(`/api/live/pulse?scope=route&routeId=${seed.routeId}`)
      .set({ "X-Visitor-Id": "other-guest-01" })
      .expect(200);
    assert.ok(other.body.data.watchingNow >= 1);
    assert.match(other.body.data.watchingText, /人在看/);
    assert.ok(other.body.data.items.some((it) => it.kind === "enroll"));
    assert.ok(other.body.data.items.some((it) => it.kind === "favorite"));
    assert.ok(other.body.data.items.some((it) => it.kind === "view"));

    const self = await agent
      .get(`/api/live/pulse?scope=route&routeId=${seed.routeId}`)
      .set({ ...auth(token), "X-Visitor-Id": "user-view-aa" })
      .expect(200);
    assert.equal(self.body.data.items.some((it) => it.kind === "enroll" && it.who === "林**"), false);
  });

  it("does not invent anonymous browse lines or unknown targets", async () => {
    await agent.post("/api/live/view").set({ "X-Visitor-Id": "anon-view-01" }).send({ scope: "route", routeId: seed.routeId }).expect(200);
    const pulse = await agent.get(`/api/live/pulse?scope=route&routeId=${seed.routeId}`).set({ "X-Visitor-Id": "anon-view-02" }).expect(200);
    assert.equal(pulse.body.data.items.some((it) => it.kind === "view"), false);
    assert.ok(pulse.body.data.watchingNow >= 1);
    await agent.post("/api/live/view").send({ scope: "route", routeId: 99999 }).expect(400);
    await agent.post("/api/live/view").send({ scope: "schedule", scheduleId: 99999 }).expect(400);
  });

  it("keeps activity enrollments off the home ticker", async () => {
    const token = await loginUser(agent);
    const start = seed.db.prepare("SELECT date('now','+5 day') AS d").get().d;
    const created = await agent
      .post("/api/trips")
      .set(auth(token))
      .send({
        title: "周五夜掼蛋局",
        activityKind: "掼蛋",
        city: "朝阳",
        startDate: start,
        meetupPoint: "三里屯太古里南区",
        meetupTime: "19:30",
        channel: "activity",
        minGroupSize: 4,
        maxSeats: 10,
      })
      .expect(200);
    const admin = await loginAdmin(agent);
    await agent
      .post(`/api/admin/schedules/${created.body.data.id}/review`)
      .set(auth(admin))
      .send({ status: "approved" })
      .expect(200);
    await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: created.body.data.id,
        travelerName: "林北野",
        travelerPhone: "13800138000",
      })
      .expect(200);
    const home = await agent.get("/api/live/pulse?scope=home").expect(200);
    assert.equal(
      home.body.data.items.some((it) => it.scheduleId === created.body.data.id),
      false
    );
    const sch = await agent
      .get(`/api/live/pulse?scope=schedule&scheduleId=${created.body.data.id}&routeId=${created.body.data.routeId}`)
      .expect(200);
    assert.ok(sch.body.data.items.some((it) => it.kind === "enroll"));
  });

  it("includes reviews and newly opened trips", async () => {
    const token = await loginUser(agent);
    await enroll(token).expect(200);
    await agent
      .post("/api/reviews")
      .set(auth(token))
      .send({ scheduleId: seed.individualScheduleId, rating: 5, content: "很好玩" })
      .expect(200);
    const pulse = await agent.get(`/api/live/pulse?scope=route&routeId=${seed.routeId}`).set({ "X-Visitor-Id": "rev-guest-01" }).expect(200);
    const review = pulse.body.data.items.find((it) => it.kind === "review");
    assert.ok(review);
    assert.match(review.text, /评了 5 分/);
    assert.ok(pulse.body.data.items.some((it) => it.kind === "open"));
  });
});
