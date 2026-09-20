const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const { harness } = require("./http");
const { getDb } = require("../src/db");
const config = require("../src/config");
const { heatLevels, targetVirtual, tickScheduleHeat, heatEnabled } = require("../src/services/virtual-heat");
const { setVirtualUsersForSchedule, growVirtualPool } = require("../src/services/virtual");
const { virtualEnrolledCount } = require("../src/services/helpers");

describe("virtual heat waterline", () => {
  let seed;

  beforeEach(() => {
    ({ seed } = harness());
  });

  function prep(id, extra = {}) {
    const now = extra.now || dayjs("2026-09-20 12:00:00");
    const createdAt = extra.createdAt || now.subtract(extra.hoursOpen || 20, "hour").format("YYYY-MM-DD HH:mm:ss");
    const start = extra.start || now.add(extra.daysToStart || 10, "day").format("YYYY-MM-DD");
    getDb()
      .prepare(
        `UPDATE schedules SET min_group_size=?, max_seats=?, created_at=?, start_date=?, end_date=?,
         heat_mode=?, heat_locked=?, organizer_type=?, join_code=?, channel=?, meetup_time='07:30' WHERE id=?`
      )
      .run(
        extra.minGroup ?? 10,
        extra.maxSeats ?? 30,
        createdAt,
        start,
        start,
        extra.heatMode || "auto",
        extra.locked ? 1 : 0,
        extra.organizerType || "official",
        extra.joinCode || "",
        extra.channel || "trip",
        id
      );
    return getDb().prepare("SELECT * FROM schedules WHERE id=?").get(id);
  }

  it("pins floor/seed/ceiling under the form line for a 10-person trip", () => {
    const sch = prep(seed.companyScheduleId);
    const levels = heatLevels(sch);
    assert.equal(levels.floor, 3);
    assert.equal(levels.seed, 5);
    assert.equal(levels.ceiling, 9);
    assert.ok(levels.floor + levels.real < levels.minGroup);
    assert.ok(levels.seed < levels.minGroup);
  });

  it("fills toward seed after 20 hours open when departure is still far", () => {
    const now = dayjs("2026-09-20 12:00:00");
    const sch = prep(seed.companyScheduleId, { now, hoursOpen: 20, daysToStart: 10 });
    const plan = targetVirtual(sch, now);
    assert.equal(plan.reason, "fill");
    assert.equal(plan.goalShown, 5);
    assert.equal(plan.target, 5);
    for (let i = 0; i < 8; i += 1) tickScheduleHeat(sch.id, { now, ignoreRate: true });
    assert.equal(virtualEnrolledCount(sch.id), 5);
  });

  it("yields one virtual when a real seat is counted (rule A)", () => {
    const now = dayjs("2026-09-20 12:00:00");
    const sch = prep(seed.companyScheduleId, { now, hoursOpen: 30, daysToStart: 10 });
    setVirtualUsersForSchedule(sch.id, 5, { heatMode: "auto", lock: false });
    assert.equal(virtualEnrolledCount(sch.id), 5);
    getDb()
      .prepare(
        `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,status,pay_status,pay_amount,seat_no)
         VALUES (?,?,?,?,?,'joined','paid',199,'1A')`
      )
      .run(sch.id, seed.userId, "林北野", "13800138000", "110101199205121219");
    const after = tickScheduleHeat(sch.id, { now, ignoreRate: true, addBudget: 0 });
    assert.equal(after.real, 1);
    assert.equal(after.virtual, 4);
    assert.equal(after.shown, 5);
  });

  it("clears virtuals inside 24 hours of departure even if the count was locked", () => {
    const now = dayjs("2026-09-20 12:00:00");
    const sch = prep(seed.companyScheduleId, {
      now,
      hoursOpen: 48,
      start: now.add(1, "day").format("YYYY-MM-DD"),
      locked: true,
    });
    setVirtualUsersForSchedule(sch.id, 4, { lock: true });
    const plan = targetVirtual(sch, now);
    assert.equal(plan.reason, "clear");
    assert.equal(plan.target, 0);
    tickScheduleHeat(sch.id, { now, ignoreRate: true });
    assert.equal(virtualEnrolledCount(sch.id), 0);
  });

  it("turns heat off for private and activity trips", () => {
    const priv = prep(seed.individualScheduleId, { joinCode: "SECRET", heatMode: "auto" });
    assert.equal(heatEnabled(priv), false);
    const act = prep(seed.companyScheduleId, { channel: "activity", heatMode: "auto" });
    assert.equal(heatEnabled(act), false);
  });

  it("caps the shared pool at the configured size", () => {
    const orig = config.virtualHeat.poolSize;
    config.virtualHeat.poolSize = 3;
    try {
      const first = growVirtualPool(3);
      assert.equal(first.total, 3);
      assert.throws(() => growVirtualPool(1), /最多 3/);
    } finally {
      config.virtualHeat.poolSize = orig;
    }
  });
});
