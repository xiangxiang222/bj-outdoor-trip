const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, auth, ID } = require("./http");
const { signUser } = require("../src/middleware/auth");

// Isolated fixtures are created by the test setup; this suite never touches live data.
const NOW = Date.parse("2026-10-25T16:30:00Z"); // Beijing Monday 2026-10-26 00:30.
const MESSAGE = "活动已开始或结束，暂不能报名";
describe("activity enrollment lifecycle", () => {
  let agent;
  let seed;
  beforeEach(() => { ({ agent, seed } = harness()); });

  function token() {
    return signUser(seed.db.prepare("SELECT * FROM users WHERE id=?").get(seed.userId));
  }
  function configure(patch = {}) {
    const values = {
      channel: "activity", review_status: "approved", status: "recruiting",
      start_date: "2026-10-27", end_date: "2026-10-27", meetup_time: "19:30",
      started_at: null, completed_at: null, offer_type: "free", heat_mode: "off",
      ...patch,
    };
    seed.db.prepare(`UPDATE schedules SET ${Object.keys(values).map((key) => key + "=?").join(",")} WHERE id=?`)
      .run(...Object.values(values), seed.individualScheduleId);
  }
  function enrollPayload(extra = {}) {
    return { scheduleId: seed.individualScheduleId, travelerName: "林北野", travelerPhone: "13800138000", ...extra };
  }
  function ledgerSnapshot() {
    return {
      enrollments: seed.db.prepare("SELECT COUNT(*) AS count FROM enrollments").get().count,
      points: seed.db.prepare("SELECT points FROM users WHERE id=?").get(seed.userId).points,
      pointsLedger: seed.db.prepare("SELECT COUNT(*) AS count FROM points_ledger").get().count,
      walletLedger: seed.db.prepare("SELECT COUNT(*) AS count FROM wallet_ledger").get().count,
      sms: seed.db.prepare("SELECT COUNT(*) AS count FROM sms_logs").get().count,
    };
  }

  it("keeps saved activity facts in both pending and approved detail responses without expanding the feed", async () => {
    const description = "【活动信息】\n跑步距离：5 公里\n参考配速：轻松跑\n跑步路线：公园环线\n\n先热身十分钟。";
    const routeId = seed.db.prepare("SELECT route_id FROM schedules WHERE id=?").get(seed.individualScheduleId).route_id;
    seed.db.prepare("UPDATE routes SET category='跑步',description=? WHERE id=?").run(description, routeId);
    for (const review_status of ["pending", "approved"]) {
      configure({ review_status, start_date: "2099-10-27", end_date: "2099-10-27" });
      const result = await agent.get("/api/schedules/" + seed.individualScheduleId).set(auth(token())).expect(200);
      assert.equal(result.body.data.route.description, description);
      assert.equal(result.body.data.reviewStatus, review_status);
    }
    const feed = await agent.get("/api/schedules?channel=activity").expect(200);
    assert.equal(Object.hasOwn(feed.body.data.find((row) => row.id === seed.individualScheduleId).route, "description"), false);
  });

  it("preserves the activity fact format after server-side English translation", async () => {
    configure();
    const { activityDetails, activityBody } = require("../../miniprogram/utils/activity-kind");
    const description = "【活动信息】\n跑步距离：五公里轻松跑\n参考配速：不竞速一起跑\n跑步路线：沿公园环线\n\n先热身十分钟。";
    const en = {
      [description]: "[Activity information]\nRunning distance: 5 km\n\nWarm up first.",
      "跑步距离：五公里轻松跑": "Running distance: 5 km easy run",
      "五公里轻松跑": "5 km easy run",
      "不竞速一起跑": "Easy social pace",
      "沿公园环线": "Park loop",
      "先热身十分钟。": "Warm up for ten minutes.",
    };
    const routeId = seed.db.prepare("SELECT route_id FROM schedules WHERE id=?").get(seed.individualScheduleId).route_id;
    seed.db.prepare("UPDATE routes SET category='跑步',description=?,i18n_json=? WHERE id=?").run(description, JSON.stringify({ sourceHash: "test", en }), routeId);
    const result = await agent.get("/api/schedules/" + seed.individualScheduleId).set("X-Lang", "en").expect(200);
    assert.deepEqual(activityDetails(result.body.data), [
      { label: "跑步距离", value: "5 km easy run" },
      { label: "参考配速", value: "Easy social pace" },
      { label: "跑步路线", value: "Park loop" },
    ]);
    assert.equal(activityBody(result.body.data), "Warm up for ten minutes.");
    const zh = await agent.get("/api/schedules/" + seed.individualScheduleId).expect(200);
    assert.equal(zh.body.data.route.description, description);
  });

  for (const [name, patch] of [
    ["a past Beijing calendar date", { start_date: "2026-10-25" }],
    ["a future-dated activity that has already started", { started_at: "2026-10-25 10:00:00" }],
    ["a future-dated activity that has completed", { completed_at: "2026-10-25 11:00:00" }],
    ["an explicitly finished activity", { status: "finished" }],
    ["an explicitly completed activity", { status: "completed" }],
    ["an explicitly ended activity", { status: "ended" }],
    ["an earlier time on today's Beijing date", { start_date: "2026-10-26", meetup_time: "00:00" }],
    ["the exact activity start minute", { start_date: "2026-10-26", meetup_time: "00:30" }],
  ]) {
    it(`rejects ${name} before any enrollment or ledger side effect`, async (t) => {
      t.mock.method(Date, "now", () => NOW);
      configure(patch);
      const before = ledgerSnapshot();
      const result = await agent.post("/api/enroll").set(auth(token())).send(enrollPayload()).expect(400);
      assert.equal(result.body.message, MESSAGE);
      assert.deepEqual(ledgerSnapshot(), before);
    });
  }

  it("allows name-and-phone enrollment for a future activity", async (t) => {
    t.mock.method(Date, "now", () => NOW);
    configure();
    const result = await agent.post("/api/enroll").set(auth(token())).send(enrollPayload()).expect(200);
    assert.equal(result.body.data.status, "joined");
    const saved = seed.db.prepare("SELECT schedule_id,user_id FROM enrollments WHERE id=?").get(result.body.data.enrollmentId);
    assert.equal(saved.schedule_id, seed.individualScheduleId);
    assert.equal(saved.user_id, seed.userId);
  });

  it("allows enrollment later on today's Beijing date, despite the device UTC date being yesterday", async (t) => {
    t.mock.method(Date, "now", () => NOW);
    configure({ start_date: "2026-10-26", meetup_time: "01:00" });
    const result = await agent.post("/api/enroll").set(auth(token())).send(enrollPayload()).expect(200);
    assert.equal(result.body.data.status, "joined");
  });

  it("preserves the legacy behavior for an activity with no valid start time", async (t) => {
    t.mock.method(Date, "now", () => NOW);
    configure({ start_date: "2026-10-26", meetup_time: "待定" });
    await agent.post("/api/enroll").set(auth(token())).send(enrollPayload()).expect(200);
  });

  it("preserves existing pending-review and cancelled guards", async (t) => {
    t.mock.method(Date, "now", () => NOW);
    configure({ review_status: "pending", started_at: "2026-10-25 10:00:00" });
    const pending = await agent.post("/api/enroll").set(auth(token())).send(enrollPayload()).expect(400);
    assert.match(pending.body.message, /审核/);
    configure({ status: "cancelled" });
    const cancelled = await agent.post("/api/enroll").set(auth(token())).send(enrollPayload()).expect(400);
    assert.match(cancelled.body.message, /已解散/);
    assert.equal(ledgerSnapshot().enrollments, 0);
  });

  it("keeps outdoor-trip enrollment outside the new activity lifecycle guard", async (t) => {
    t.mock.method(Date, "now", () => NOW);
    configure({ channel: "trip", start_date: "2026-10-25", started_at: "2026-10-25 10:00:00", completed_at: "2026-10-25 11:00:00", status: "finished" });
    const result = await agent.post("/api/enroll").set(auth(token())).send(enrollPayload({
      idCard: ID.maleBj, emergencyName: "家人", emergencyPhone: "13700000002", waiverAccepted: true, healthOk: true,
    })).expect(200);
    assert.equal(result.body.data.status, "joined");
  });
});
