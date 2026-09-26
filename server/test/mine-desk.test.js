const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const { harness, loginUser, auth } = require("./http");
const { getDb } = require("../src/db");
const { pushUserNotice } = require("../src/services/mine-desk");

describe("mine desk", () => {
  let agent;
  let seed;
  let token;

  beforeEach(async () => {
    ({ agent, seed } = harness());
    token = await loginUser(agent);
  });

  it("saves companions and rejects a bad phone", async () => {
    const bad = await agent.post("/api/me/companions").set(auth(token)).send({ name: "小周", phone: "123" });
    assert.equal(bad.status, 400);
    const saved = await agent
      .post("/api/me/companions")
      .set(auth(token))
      .send({ name: "小周", phone: "13700001111", emergencyName: "妈妈", emergencyPhone: "13700002222" })
      .expect(200);
    assert.equal(saved.body.data[0].name, "小周");
    assert.equal(saved.body.data[0].emergencyPhone, "13700002222");
    const listed = await agent.get("/api/me/companions").set(auth(token)).expect(200);
    assert.equal(listed.body.data.length, 1);
    const removed = await agent.delete("/api/me/companions/" + saved.body.data[0].id).set(auth(token)).expect(200);
    assert.equal(removed.body.data.length, 0);
  });

  it("refuses following yourself and lists someone else", async () => {
    const self = await agent.post("/api/me/follows/" + seed.userId).set(auth(token));
    assert.equal(self.status, 400);
    await agent.post("/api/me/follows/" + seed.companyUserId).set(auth(token)).expect(200);
    const mine = await agent.get("/api/me/follows").set(auth(token)).expect(200);
    assert.equal(mine.body.data[0].id, seed.companyUserId);
    const profile = await agent.get("/api/users/" + seed.companyUserId).set(auth(token)).expect(200);
    assert.equal(profile.body.data.followed, true);
    await agent.delete("/api/me/follows/" + seed.companyUserId).set(auth(token)).expect(200);
  });

  it("keeps one notice per event and clears the unread count", async () => {
    const notice = {
      userId: seed.userId,
      kind: "group",
      title: "已成团",
      body: "人数够了",
      href: "/m/schedule/" + seed.individualScheduleId,
      refType: "schedule",
      refId: seed.individualScheduleId,
    };
    pushUserNotice(notice);
    pushUserNotice(notice);
    const listed = await agent.get("/api/me/notices").set(auth(token)).expect(200);
    assert.equal(listed.body.data.length, 1);
    assert.equal(listed.body.unread, 1);
    const read = await agent.post("/api/me/notices/read-all").set(auth(token)).expect(200);
    assert.equal(read.body.data[0].unread, false);
    const again = await agent.get("/api/me/notices").set(auth(token)).expect(200);
    assert.equal(again.body.unread, 0);
  });

  it("returns recently viewed routes", async () => {
    getDb().prepare("INSERT INTO page_views (visitor_id, user_id, route_id) VALUES (?,?,?)").run("desk-test", seed.userId, seed.routeId);
    const res = await agent.get("/api/me/views").set(auth(token)).expect(200);
    assert.equal(res.body.data[0].id, seed.routeId);
    assert.ok(res.body.data[0].title);
  });

  it("hints when a coupon expires tomorrow", async () => {
    const at = dayjs().add(1, "day").hour(12).minute(0).second(0).format("YYYY-MM-DD HH:mm:ss");
    getDb()
      .prepare("INSERT INTO user_coupons (user_id, code, status, expires_at) VALUES (?,?,?,?)")
      .run(seed.userId, "DESKTOMORROW", "unused", at);
    const res = await agent.get("/api/me/wallet").set(auth(token)).expect(200);
    assert.equal(res.body.data.couponExpireHint, "1 张明天到期");
  });

  it("shows where a refund went on the order", async () => {
    const db = getDb();
    const enId = Number(
      db.prepare(
        "INSERT INTO enrollments (schedule_id, user_id, traveler_name, traveler_phone, status, pay_status, pay_amount) VALUES (?,?,?,?,?,?,?)"
      ).run(seed.individualScheduleId, seed.userId, "林北野", "13800138000", "cancelled", "refunded", 100).lastInsertRowid
    );
    db.prepare(
      "INSERT INTO payments (enrollment_id, user_id, schedule_id, amount, channel, status, trade_no, scene, refund_of) VALUES (?,?,?,?,?,?,?,?,?)"
    ).run(enId, seed.userId, seed.individualScheduleId, 80, "wallet", "refunded", "RFDESK", "enrollment", 1);
    const res = await agent.get("/api/orders").set(auth(token)).expect(200);
    const row = res.body.data.find((item) => item.id === enId);
    assert.equal(row.refundProgress.text, "已退回余额 ¥80");
    assert.equal(row.refundProgress.channel, "wallet");
    const wallet = await agent.get("/api/me/wallet").set(auth(token)).expect(200);
    assert.equal(wallet.body.data.refundCount, 1);
  });
});
