const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const { getDb } = require("../src/db");
const { harness, loginUser, auth } = require("./http");

describe("daily sign-in", () => {
  let agent;

  beforeEach(() => {
    ({ agent } = harness());
  });

  it("signs in once a day and continues a streak", async () => {
    const token = await loginUser(agent);
    const me = await agent.get("/api/me").set(auth(token)).expect(200);
    const before = me.body.data.points;

    const firstLook = await agent.get("/api/me/signin").set(auth(token)).expect(200);
    assert.equal(firstLook.body.data.signedToday, false);
    assert.equal(firstLook.body.data.todayPoints, 2);
    assert.equal(firstLook.body.data.days.length, 7);
    assert.equal(firstLook.body.data.days[0].label, "今天");

    const signed = await agent.post("/api/me/signin").set(auth(token)).expect(200);
    assert.equal(signed.body.data.already, false);
    assert.equal(signed.body.data.gained, 2);
    assert.equal(signed.body.data.streak, 1);
    assert.equal(signed.body.data.points, before + 2);
    assert.equal(signed.body.data.signedToday, true);

    const again = await agent.post("/api/me/signin").set(auth(token)).expect(200);
    assert.equal(again.body.data.already, true);
    assert.equal(again.body.data.gained, 0);
    assert.equal(again.body.data.points, before + 2);

    const userId = me.body.data.id;
    const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");
    getDb().prepare("DELETE FROM user_signins WHERE user_id=?").run(userId);
    getDb().prepare("INSERT INTO user_signins (user_id, day, streak, points) VALUES (?,?,?,?)").run(userId, yesterday, 1, 2);
    const next = await agent.post("/api/me/signin").set(auth(token)).expect(200);
    assert.equal(next.body.data.streak, 2);
    assert.equal(next.body.data.gained, 2);
    assert.equal(next.body.data.days[0].signed, true);
  });
});
