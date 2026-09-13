const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getDb, toRoute, resetDb, createSchema } = require("../src/db");
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
