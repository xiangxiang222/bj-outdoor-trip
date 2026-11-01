const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, auth } = require("./http");
const { signUser } = require("../src/middleware/auth");

describe("activity contact and one-off route boundaries", () => {
  let agent, seed;
  beforeEach(() => { ({ agent, seed } = harness()); });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7l8AAAAASUVORK5CYII=", "base64");
  function token(id = seed.userId) { return signUser(seed.db.prepare("SELECT * FROM users WHERE id=?").get(id)); }
  function publish(body = {}) {
    return agent.post("/api/trips").set(auth(token())).send({
      channel: "activity", activityKind: "掼蛋", title: "周末新手掼蛋", startDate: "2099-11-01",
      meetupTime: "19:30", meetupPoint: "社区咖啡馆", originPrice: 0, ...body,
    });
  }
  async function upload() {
    const result = await agent.post("/api/upload").set(auth(token())).attach("file", png, "wechat-group.png").expect(200);
    return result.body.data.url;
  }

  it("saves a real uploaded group image for every activity kind and keeps it out of public feed", async () => {
    const qr = await upload();
    for (const activityKind of ["掼蛋", "跑步", "电影", "招募"]) {
      const created = await publish({ activityKind, title: activityKind + "同城活动", consultGroup: "入群请备注报名姓名", consultGroupQrImage: qr }).expect(200);
      const id = created.body.data.id;
      const saved = seed.db.prepare("SELECT * FROM schedules WHERE id=?").get(id);
      assert.equal(saved.consult_group_qr_image, qr);
      const mine = await agent.get("/api/schedules/" + id).set(auth(token())).expect(200);
      assert.ok(mine.body.data.consultGroupQr.endsWith(qr));
      assert.equal(mine.body.data.consultGroup, "入群请备注报名姓名");
      const guest = await agent.get("/api/schedules/" + id).expect(200);
      assert.equal(guest.body.data.consultGroupQr, "");
      assert.equal(guest.body.data.consultGroup, "");
      seed.db.prepare("UPDATE schedules SET review_status='approved' WHERE id=?").run(id);
    }
    const feed = await agent.get("/api/schedules?channel=activity").expect(200);
    assert.equal(feed.body.data.length, 4);
    assert.ok(feed.body.data.every((row) => row.consultGroup === "" && !row.consultGroupQrImage && !row.consultGroupQr));
  });

  it("reveals the group only to its host or confirmed paid participant, including completed records", async () => {
    const qr = await upload();
    const created = await publish({ consultGroup: "报名后联系", consultGroupQrImage: qr }).expect(200);
    const id = created.body.data.id;
    const viewer = token(seed.companyUserId);
    const inserted = seed.db.prepare("INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,status,pay_status,pay_amount) VALUES (?,?,?,?,?,?,?)")
      .run(id, seed.companyUserId, "参与者", "13900139000", "joined", "unpaid", 20);
    for (const [status, payStatus, visible] of [
      ["joined", "unpaid", false], ["waitlist", "paid", false], ["applied", "paid", false],
      ["cancelled", "paid", false], ["joined", "paid", true],
    ]) {
      seed.db.prepare("UPDATE enrollments SET status=?,pay_status=? WHERE id=?").run(status, payStatus, inserted.lastInsertRowid);
      const result = await agent.get("/api/schedules/" + id).set(auth(viewer)).expect(200);
      assert.equal(!!result.body.data.consultGroupQr, visible, status + "/" + payStatus);
      assert.equal(!!result.body.data.consultGroup, visible);
    }
    seed.db.prepare("UPDATE schedules SET status='finished',completed_at='2099-11-01 22:00:00' WHERE id=?").run(id);
    const ended = await agent.get("/api/schedules/" + id).set(auth(viewer)).expect(200);
    assert.ok(ended.body.data.consultGroupQr.endsWith(qr));
  });

  it("does not fabricate a QR code when the host supplies text alone", async () => {
    const created = await publish({ consultGroup: "联系发起人" }).expect(200);
    const mine = await agent.get("/api/schedules/" + created.body.data.id).set(auth(token())).expect(200);
    assert.equal(mine.body.data.consultGroupQr, "");
    assert.equal(mine.body.data.consultGroup, "联系发起人");
  });

  it("hides legacy generated or missing group images while keeping contact text", async () => {
    const created = await publish({ consultGroup: "联系发起人" }).expect(200);
    const activityId = created.body.data.id;
    for (const id of [activityId, seed.individualScheduleId]) {
      for (const image of [null, "data:image/png;base64,fake", "/api/qr?text=wechat", "https://outside.test/qr.png", "/static/uploads/deleted.png"]) {
        seed.db.prepare("UPDATE schedules SET consult_group='联系发起人',consult_group_qr_image=? WHERE id=?").run(image, id);
        const result = await agent.get("/api/schedules/" + id).set(auth(token())).expect(200);
        assert.equal(result.body.data.consultGroupQr, "", image || "missing image");
        assert.equal(result.body.data.consultGroup, "联系发起人");
      }
    }
  });

  it("rejects invalid and missing image references before creating any route or schedule", async () => {
    const count = () => [seed.db.prepare("SELECT COUNT(*) AS c FROM routes").get().c, seed.db.prepare("SELECT COUNT(*) AS c FROM schedules").get().c];
    const before = count();
    for (const consultGroupQrImage of ["javascript:alert(1)", "https://outside.test/qr.png", "/static/uploads/../../secret.png", "/static/uploads/missing.png", "/static/uploads/a.svg"]) {
      await publish({ consultGroupQrImage }).expect(400);
      assert.deepEqual(count(), before);
    }
    await publish({ consultGroup: "长".repeat(81) }).expect(400);
    assert.deepEqual(count(), before);
  });

  it("prevents activity storage routes from being opened as reusable travel routes and maps order kind", async () => {
    const created = await publish().expect(200);
    const id = created.body.data.id;
    seed.db.prepare("UPDATE schedules SET review_status='approved' WHERE id=?").run(id);
    const routeId = created.body.data.routeId;
    seed.db.prepare("UPDATE routes SET status='on',review_status='approved' WHERE id=?").run(routeId);
    const response = await agent.get("/api/routes/" + routeId).set(auth(token())).expect(404);
    assert.match(response.body.message, /同城活动/);
    await agent.post("/api/enroll").set(auth(token())).send({ scheduleId: id, travelerName: "林北野", travelerPhone: "13800138000" }).expect(200);
    const orders = await agent.get("/api/orders").set(auth(token())).expect(200);
    assert.equal(orders.body.data[0].activityKind, "掼蛋");
    assert.equal(orders.body.data[0].channel, "activity");
    assert.match(orders.body.data[0].cover, /activities\/guandan.png/);
  });

  it("shows only approved future unstarted travel groups under other departure dates", async (t) => {
    t.mock.method(Date, "now", () => Date.parse("2026-11-01T00:30:00+08:00"));
    const routeId = seed.db.prepare("SELECT route_id FROM schedules WHERE id=?").get(seed.individualScheduleId).route_id;
    seed.db.prepare("UPDATE schedules SET status='cancelled' WHERE route_id=? AND id!=?").run(routeId, seed.individualScheduleId);
    seed.db.prepare("UPDATE schedules SET start_date='2026-11-01',end_date='2026-11-01',meetup_time='23:00',status='recruiting',started_at=NULL,completed_at=NULL WHERE id=?").run(seed.individualScheduleId);
    const insert = seed.db.prepare("INSERT INTO schedules (route_id,start_date,end_date,meetup_time,status,review_status,channel,started_at,completed_at,bus_type_id,min_group_size,max_seats) SELECT route_id,?,?,?, ?,?,?, ?,?,bus_type_id,min_group_size,max_seats FROM schedules WHERE id=?");
    for (const [date, time, status, review, started, ended] of [
      ["2026-10-31", "23:00", "recruiting", "approved", null, null],
      ["2026-11-01", "00:00", "recruiting", "approved", null, null],
      ["2026-11-02", "09:00", "finished", "approved", null, null],
      ["2026-11-02", "09:00", "recruiting", "pending", null, null],
      ["2026-11-02", "09:00", "recruiting", "approved", "2026-11-01 00:00", null],
      ["2026-11-02", "09:00", "recruiting", "approved", null, "2026-11-01 00:00"],
    ]) insert.run(date, date, time, status, review, "trip", started, ended, seed.individualScheduleId);
    const response = await agent.get("/api/routes/" + routeId).expect(200);
    assert.deepEqual(response.body.data.schedules.map((row) => row.id), [seed.individualScheduleId]);
  });

  it("keeps a real travel route accessible when an activity schedule also references it", async () => {
    const routeId = seed.db.prepare("SELECT route_id FROM schedules WHERE id=?").get(seed.individualScheduleId).route_id;
    const activityId = seed.db.prepare(`INSERT INTO schedules
      (route_id,start_date,end_date,meetup_time,status,review_status,channel,bus_type_id,min_group_size,max_seats)
      SELECT route_id,'2099-11-01','2099-11-01','19:30','recruiting','approved','activity',bus_type_id,min_group_size,max_seats
      FROM schedules WHERE id=?`).run(seed.individualScheduleId).lastInsertRowid;
    const result = await agent.get("/api/routes/" + routeId).expect(200);
    assert.equal(result.body.data.id, routeId);
    assert.ok(result.body.data.schedules.some(row => row.id === seed.individualScheduleId));
    assert.ok(result.body.data.schedules.every(row => row.id !== Number(activityId) && row.channel !== "activity"));
  });

  it("keeps a cancelled activity order as a record without offering payment", async () => {
    const created = await publish({ originPrice: 20 }).expect(200);
    const id = created.body.data.id;
    seed.db.prepare("UPDATE schedules SET review_status='approved' WHERE id=?").run(id);
    const joined = await agent.post("/api/enroll").set(auth(token())).send({ scheduleId: id, travelerName: "林北野", travelerPhone: "13800138000" }).expect(200);
    // Legacy records may retain joined/unpaid when their schedule is cancelled.
    seed.db.prepare("UPDATE schedules SET status='cancelled' WHERE id=?").run(id);
    const response = await agent.get("/api/orders/" + joined.body.data.enrollmentId).set(auth(token())).expect(200);
    assert.equal(response.body.data.canPay, false);
    assert.equal(response.body.data.schedule_status, "cancelled");
  });
});
