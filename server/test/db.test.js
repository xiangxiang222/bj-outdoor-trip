const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getDb, toRoute, resetDb, createSchema, hideStashedRoutes } = require("../src/db");
const { seedMinimal } = require("./helpers");

describe("db helpers", () => {
  it("maps route rows and JSON fields", () => {
    const seed = seedMinimal();
    const row = seed.db.prepare("SELECT * FROM routes WHERE id=?").get(seed.routeId);
    const mapped = toRoute(row, { extra: 1 });
    assert.equal(mapped.code, "R01");
    assert.equal(mapped.distanceKm, 78);
    assert.deepEqual(mapped.tags, ["长城"]);
    assert.equal(mapped.extra, 1);
    assert.equal(toRoute(null), null);
  });

  it("hides mountain routes once and leaves activity-only routes listed", () => {
    const db = getDb();
    const prev = db.prepare("SELECT value FROM settings WHERE key='demo_routes_hidden'").get();
    const before = db.prepare("SELECT id, status FROM routes").all();
    db.prepare("DELETE FROM settings WHERE key='demo_routes_hidden'").run();
    const mountain = db.prepare("INSERT INTO routes (code,title,status,review_status) VALUES ('ZZ-M','山野测试','on','approved')").run();
    const activity = db.prepare("INSERT INTO routes (code,title,status,review_status) VALUES ('ZZ-A','同城测试','on','approved')").run();
    db.prepare("INSERT INTO schedules (route_id,start_date,channel,status,review_status) VALUES (?,?,?,?,?)").run(
      activity.lastInsertRowid,
      "2026-12-01",
      "activity",
      "recruiting",
      "approved"
    );
    hideStashedRoutes(db);
    assert.equal(db.prepare("SELECT status FROM routes WHERE id=?").get(mountain.lastInsertRowid).status, "off");
    assert.equal(db.prepare("SELECT status FROM routes WHERE id=?").get(activity.lastInsertRowid).status, "on");
    db.prepare("UPDATE routes SET status='on' WHERE id=?").run(mountain.lastInsertRowid);
    hideStashedRoutes(db);
    assert.equal(db.prepare("SELECT status FROM routes WHERE id=?").get(mountain.lastInsertRowid).status, "on");
    db.prepare("DELETE FROM schedules WHERE route_id=?").run(activity.lastInsertRowid);
    db.prepare("DELETE FROM routes WHERE code IN ('ZZ-M','ZZ-A')").run();
    for (const row of before) db.prepare("UPDATE routes SET status=? WHERE id=?").run(row.status, row.id);
    db.prepare("DELETE FROM settings WHERE key='demo_routes_hidden'").run();
    if (prev) db.prepare("INSERT INTO settings (key,value) VALUES ('demo_routes_hidden',?)").run(prev.value);
  });

  it("resetDb closes the singleton so getDb reopens", () => {
    seedMinimal();
    const first = getDb();
    resetDb();
    const second = getDb();
    assert.notEqual(first, second);
    createSchema(second);
    const tables = second.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    assert.equal(tables.name, "users");
  });

  it("dedupes payment trade_no before unique index so startup does not crash", () => {
    const db = getDb();
    db.exec("DROP INDEX IF EXISTS idx_payments_trade_no");
    const ins = db.prepare(
      "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark) VALUES (0,1,0,1,'wechat','success',?,'x')"
    );
    ins.run("SAME");
    ins.run("SAME");
    ins.run("KEEP");
    resetDb();
    const next = getDb();
    const nos = next.prepare("SELECT trade_no FROM payments ORDER BY id").all().map((row) => row.trade_no);
    assert.equal(new Set(nos).size, nos.length);
    assert.ok(nos.includes("SAME"));
    assert.ok(nos.includes("KEEP"));
    const idx = next
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_payments_trade_no'")
      .get();
    assert.equal(idx.name, "idx_payments_trade_no");
  });
});
