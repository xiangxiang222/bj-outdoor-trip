const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const { getDb } = require("../src/db");
const { harness, loginUser, loginAdmin, auth, ID, enrollPayload } = require("./http");
const { ensureOfficialTrips, mergeDueTrips } = require("../src/services/official-trip");

describe("official trips, personal bounty and merge", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("exposes trip bounty on meta and lets admin publish an official trip", async () => {
    const meta = await agent.get("/api/meta").expect(200);
    assert.equal(meta.body.data.tripBounty, 200);
    assert.ok(meta.body.data.faqs.some((f) => /官方团/.test(f.q)));

    const admin = await loginAdmin(agent);
    const start = dayjs().add(8, "day").format("YYYY-MM-DD");
    const created = await agent
      .post("/api/admin/schedules")
      .set(auth(admin))
      .send({
        routeId: seed.routeId,
        startDate: start,
        busTypeId: "coaster10",
        minGroupSize: 10,
        meetupPoint: "东直门东方银座C口",
        meetupTime: "07:30",
        organizerType: "official",
      })
      .expect(200);
    assert.equal(created.body.data.organizerType, "official");
    assert.equal(created.body.data.kind, "official");
    assert.equal(created.body.data.kindLabel, "官方");
    assert.equal(created.body.data.organizerName, "同行者众");
    assert.equal(created.body.data.organizerId, 0);
  });

  it("keeps client publish as personal even if official is sent", async () => {
    const token = await loginUser(agent);
    const start = dayjs().add(9, "day").format("YYYY-MM-DD");
    const created = await agent
      .post("/api/schedules")
      .set(auth(token))
      .send({
        routeId: seed.routeId,
        startDate: start,
        busTypeId: "coaster10",
        minGroupSize: 10,
        meetupPoint: "东直门东方银座C口",
        meetupTime: "07:30",
        organizerType: "official",
      })
      .expect(200);
    assert.equal(created.body.data.organizerType, "individual");
    assert.equal(created.body.data.kind, "individual");
    assert.equal(created.body.data.bountyStatus, "pending");
    assert.equal(created.body.data.bountyAmount, 200);
  });

  it("fills one official trip per listed route per day and is idempotent", async () => {
    const now = dayjs("2026-09-19");
    const first = ensureOfficialTrips({ now, days: 2 });
    assert.equal(first.count, 2);
    const second = ensureOfficialTrips({ now, days: 2 });
    assert.equal(second.count, 0);
    const rows = getDb()
      .prepare("SELECT * FROM schedules WHERE organizer_type='official' AND start_date IN ('2026-09-19','2026-09-20')")
      .all();
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.review_status === "approved"));
    assert.ok(rows.every((row) => row.meetup_point.includes("东直门")));
  });

  it("pays 200 once when a personal trip forms, not for official", async () => {
    const token = await loginUser(agent);
    const admin = await loginAdmin(agent);
    const start = dayjs().add(6, "day").format("YYYY-MM-DD");
    const personal = await agent
      .post("/api/schedules")
      .set(auth(token))
      .send({
        routeId: seed.routeId,
        startDate: start,
        busTypeId: "coaster10",
        minGroupSize: 1,
        meetupPoint: "丽泽桥西南角",
        meetupTime: "08:00",
        organizerType: "individual",
      })
      .expect(200);
    await agent
      .post("/api/enroll")
      .set(auth(token))
      .send(
        enrollPayload({
          scheduleId: personal.body.data.id,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
        })
      )
      .expect(200);
    const paid = getDb()
      .prepare("SELECT * FROM payments WHERE scene='trip_bounty' AND schedule_id=?")
      .get(personal.body.data.id);
    assert.ok(paid);
    assert.equal(paid.amount, 200);
    assert.equal(paid.user_id, seed.userId);
    const again = getDb().prepare("SELECT bounty_status FROM schedules WHERE id=?").get(personal.body.data.id);
    assert.equal(again.bounty_status, "paid");

    const official = await agent
      .post("/api/admin/schedules")
      .set(auth(admin))
      .send({
        routeId: seed.routeId,
        startDate: dayjs().add(7, "day").format("YYYY-MM-DD"),
        busTypeId: "coaster10",
        minGroupSize: 1,
        meetupPoint: "东直门东方银座C口",
        meetupTime: "07:30",
        organizerType: "official",
      })
      .expect(200);
    await agent
      .post("/api/enroll")
      .set(auth(token))
      .send(
        enrollPayload({
          scheduleId: official.body.data.id,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.femaleBj,
        })
      )
      .expect(200);
    const officialPay = getDb()
      .prepare("SELECT * FROM payments WHERE scene='trip_bounty' AND schedule_id=?")
      .get(official.body.data.id);
    assert.equal(officialPay, undefined);
  });

  it("merges unformed same-slot trips into official the day before and expands seats", async () => {
    const token = await loginUser(agent);
    getDb().prepare("UPDATE users SET wechat_openid=? WHERE id=?").run("o_merge_demo", seed.userId);
    const admin = await loginAdmin(agent);
    const now = dayjs("2026-09-19");
    const tomorrow = now.add(1, "day").format("YYYY-MM-DD");
    const official = await agent
      .post("/api/admin/schedules")
      .set(auth(admin))
      .send({
        routeId: seed.routeId,
        startDate: tomorrow,
        busTypeId: "coaster10",
        minGroupSize: 10,
        meetupPoint: "东直门东方银座C口",
        meetupTime: "07:30",
        organizerType: "official",
      })
      .expect(200);
    getDb().prepare("UPDATE schedules SET max_seats=1 WHERE id=?").run(official.body.data.id);

    const personal = await agent
      .post("/api/schedules")
      .set(auth(token))
      .send({
        routeId: seed.routeId,
        startDate: tomorrow,
        busTypeId: "coaster10",
        minGroupSize: 10,
        meetupPoint: "东直门东方银座C口",
        meetupTime: "07:30",
        organizerType: "individual",
      })
      .expect(200);

    await agent
      .post("/api/enroll")
      .set(auth(token))
      .send(
        enrollPayload({
          scheduleId: personal.body.data.id,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
        })
      )
      .expect(200);
    await agent
      .post("/api/enroll")
      .set(auth(token))
      .send(
        enrollPayload({
          scheduleId: personal.body.data.id,
          travelerName: "同伴甲",
          travelerPhone: "13800138001",
          idCard: ID.femaleBj,
          emergencyPhone: "13700000003",
        })
      )
      .expect(200);

    const otherDay = await agent
      .post("/api/schedules")
      .set(auth(token))
      .send({
        routeId: seed.routeId,
        startDate: now.add(3, "day").format("YYYY-MM-DD"),
        busTypeId: "coaster10",
        minGroupSize: 10,
        meetupPoint: "东直门东方银座C口",
        meetupTime: "07:30",
      })
      .expect(200);

    const result = mergeDueTrips({ now });
    assert.equal(result.date, tomorrow);
    assert.ok(result.sources.includes(personal.body.data.id));
    assert.equal(result.sources.includes(otherDay.body.data.id), false);

    const src = getDb().prepare("SELECT * FROM schedules WHERE id=?").get(personal.body.data.id);
    assert.equal(src.status, "cancelled");
    assert.equal(src.merged_into, official.body.data.id);
    assert.match(src.cancel_reason, /官方团/);

    const dest = getDb().prepare("SELECT * FROM schedules WHERE id=?").get(official.body.data.id);
    assert.ok(dest.max_seats >= 2);
    const moved = getDb()
      .prepare("SELECT COUNT(*) AS c FROM enrollments WHERE schedule_id=? AND status='joined'")
      .get(official.body.data.id);
    assert.equal(moved.c, 2);

    const sms = getDb().prepare("SELECT * FROM sms_logs WHERE scene='merge' ORDER BY id").all();
    assert.equal(sms.length, 2);
    assert.match(sms[0].content, /官方团/);
    const wx = getDb().prepare("SELECT * FROM wechat_notices WHERE scene='merge'").all();
    assert.ok(wx.length >= 1);
    assert.equal(wx[0].status, "sent");
    assert.match(wx[0].page, /pages\/schedule\/schedule/);

    const bounty = getDb()
      .prepare("SELECT * FROM payments WHERE scene='trip_bounty' AND schedule_id=?")
      .get(personal.body.data.id);
    assert.equal(bounty, undefined);
  });

  it("does not merge a formed personal trip or a different meetup", async () => {
    const token = await loginUser(agent);
    const admin = await loginAdmin(agent);
    const now = dayjs("2026-09-19");
    const tomorrow = now.add(1, "day").format("YYYY-MM-DD");
    await agent
      .post("/api/admin/schedules")
      .set(auth(admin))
      .send({
        routeId: seed.routeId,
        startDate: tomorrow,
        busTypeId: "coaster10",
        minGroupSize: 10,
        meetupPoint: "东直门东方银座C口",
        meetupTime: "07:30",
        organizerType: "official",
      })
      .expect(200);

    const formed = await agent
      .post("/api/schedules")
      .set(auth(token))
      .send({
        routeId: seed.routeId,
        startDate: tomorrow,
        busTypeId: "coaster10",
        minGroupSize: 1,
        meetupPoint: "东直门东方银座C口",
        meetupTime: "07:30",
      })
      .expect(200);
    await agent
      .post("/api/enroll")
      .set(auth(token))
      .send(
        enrollPayload({
          scheduleId: formed.body.data.id,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
        })
      )
      .expect(200);

    const elsewhere = await agent
      .post("/api/schedules")
      .set(auth(token))
      .send({
        routeId: seed.routeId,
        startDate: tomorrow,
        busTypeId: "coaster10",
        minGroupSize: 10,
        meetupPoint: "丽泽桥西南角",
        meetupTime: "07:00",
      })
      .expect(200);

    const result = mergeDueTrips({ now });
    assert.equal(result.sources.includes(formed.body.data.id), false);
    const formedRow = getDb().prepare("SELECT status FROM schedules WHERE id=?").get(formed.body.data.id);
    assert.notEqual(formedRow.status, "cancelled");
    assert.ok(result.sources.includes(elsewhere.body.data.id));
    const elseRow = getDb().prepare("SELECT merged_into, status FROM schedules WHERE id=?").get(elsewhere.body.data.id);
    assert.equal(elseRow.status, "cancelled");
    const dest = getDb().prepare("SELECT * FROM schedules WHERE id=?").get(elseRow.merged_into);
    assert.equal(dest.organizer_type, "official");
    assert.equal(dest.meetup_point, "丽泽桥西南角");
  });
});
