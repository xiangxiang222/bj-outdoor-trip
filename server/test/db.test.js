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
});
