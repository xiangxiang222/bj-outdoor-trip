const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const {
  isMember,
  enrolledCount,
  loadRouteBundle,
  quoteForSchedule,
  maybeMatchGuide,
  addPoints,
  attachAssetHost,
} = require("../src/services/helpers");
const { seedMinimal } = require("./helpers");

describe("helpers service", () => {
  let seed;

  beforeEach(() => {
    seed = seedMinimal();
  });

  it("isMember respects expiry", () => {
    assert.equal(isMember(null), false);
    assert.equal(isMember({ is_member: 0 }), false);
    assert.equal(isMember({ is_member: 1 }), true);
    assert.equal(isMember({ is_member: 1, member_expire_at: dayjs().add(1, "day").format("YYYY-MM-DD") }), true);
    assert.equal(isMember({ is_member: 1, member_expire_at: dayjs().subtract(1, "day").format("YYYY-MM-DD") }), false);
  });

  it("loads route bundle and quotes member vs origin price", () => {
    const bundle = loadRouteBundle(seed.routeId);
    assert.ok(bundle.route);
    assert.equal(bundle.tiers.length, 2);
    assert.ok(bundle.buses.length >= 1);
    const member = seed.db.prepare("SELECT * FROM users WHERE id=?").get(seed.userId);
    const q = quoteForSchedule({ route_id: seed.routeId }, 20, member);
    assert.equal(q.originPrice, 179);
    assert.equal(q.price, 170);
    assert.equal(q.isMember, true);
    const missing = quoteForSchedule({ route_id: 99999 }, 10, member);
    assert.equal(missing.price, 0);
  });

  it("counts enrollments excluding cancelled", () => {
    seed.db
      .prepare(
        `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,pay_status,status)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(seed.individualScheduleId, seed.userId, "A", "13800000001", "110101199001011211", "paid", "joined");
    seed.db
      .prepare(
        `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,pay_status,status)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(seed.individualScheduleId, seed.userId, "B", "13800000002", "110101199001011229", "unpaid", "cancelled");
    assert.equal(enrolledCount(seed.individualScheduleId), 1);
    seed.db
      .prepare(
        `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,pay_status,status)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(seed.individualScheduleId, seed.userId, "C", "13800000003", "130102198805201218", "unpaid", "waitlist");
    assert.equal(enrolledCount(seed.individualScheduleId), 1);
  });

  it("matches guide when min group size is reached", () => {
    seed.db
      .prepare(
        `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,pay_status,status)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(seed.individualScheduleId, seed.userId, "A", "13800000001", "110101199001011211", "paid", "joined");
    let sch = maybeMatchGuide(seed.individualScheduleId);
    assert.equal(sch.guide_id, null);
    seed.db
      .prepare(
        `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,pay_status,status)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(seed.individualScheduleId, seed.userId, "B", "13800000002", "110101199001011229", "paid", "joined");
    sch = maybeMatchGuide(seed.individualScheduleId);
    assert.ok(sch.guide_id);
    assert.equal(sch.status, "confirmed");
    const again = maybeMatchGuide(seed.individualScheduleId);
    assert.equal(again.guide_id, sch.guide_id);
  });

  it("confirms without guide when roster is empty", () => {
    seed.db.exec("DELETE FROM guides");
    seed.db
      .prepare(
        `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,pay_status,status)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(seed.individualScheduleId, seed.userId, "A", "13800000001", "110101199001011211", "paid", "joined");
    seed.db
      .prepare(
        `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,pay_status,status)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(seed.individualScheduleId, seed.userId, "B", "13800000002", "110101199001011229", "paid", "joined");
    const sch = maybeMatchGuide(seed.individualScheduleId);
    assert.equal(sch.status, "confirmed");
    assert.equal(sch.guide_id, null);
  });

  it("returns undefined for missing schedule", () => {
    assert.equal(maybeMatchGuide(99999), undefined);
  });

  it("confirms when the route row is missing", () => {
    seed.db.prepare("UPDATE schedules SET route_id=99999 WHERE id=?").run(seed.individualScheduleId);
    seed.db
      .prepare(
        `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,pay_status,status)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(seed.individualScheduleId, seed.userId, "A", "13800000001", "110101199001011211", "paid", "joined");
    seed.db
      .prepare(
        `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,pay_status,status)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(seed.individualScheduleId, seed.userId, "B", "13800000002", "110101199001011229", "paid", "joined");
    const sch = maybeMatchGuide(seed.individualScheduleId);
    assert.equal(sch.status, "confirmed");
  });

  it("adds points ledger entries", () => {
    const next = addPoints(seed.userId, 10, "测试入账", "test", 1);
    assert.equal(next, 510);
    const row = seed.db.prepare("SELECT * FROM points_ledger WHERE user_id=? ORDER BY id DESC").get(seed.userId);
    assert.equal(row.delta, 10);
    assert.equal(row.reason, "测试入账");
  });

  it("attaches asset host for relative urls", () => {
    const req = { protocol: "http", get: () => "127.0.0.1:3780" };
    assert.equal(attachAssetHost(req, ""), "");
    assert.equal(attachAssetHost(req, "https://cdn.example/a.jpg"), "https://cdn.example/a.jpg");
    assert.equal(attachAssetHost(req, "/static/a.jpg"), "http://127.0.0.1:3780/static/a.jpg");
    assert.match(attachAssetHost(req, "/static/photos/shangfangCave.jpg"), /^https:\/\//);
  });

  it("rewrites loopback media urls using forwarded host", () => {
    const req = {
      protocol: "http",
      get(name) {
        if (name === "x-forwarded-host") return "192.168.1.81:3781";
        if (name === "x-forwarded-proto") return "http";
        return "127.0.0.1:3780";
      },
    };
    assert.equal(attachAssetHost(req, "/static/a.jpg"), "http://192.168.1.81:3781/static/a.jpg");
    assert.equal(attachAssetHost(req, "http://127.0.0.1:3780/static/a.jpg"), "http://192.168.1.81:3781/static/a.jpg");
  });
});
