const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { harness, loginAdmin, auth } = require("./http");
const { signAdmin, signUser } = require("../src/middleware/auth");
const { initializeRoutePreferences } = require("../src/services/route-preferences");

describe("route preferences", () => {
  let agent;
  let seed;
  let sequence;

  beforeEach(() => {
    ({ agent, seed } = harness());
    seed.db.exec("DELETE FROM route_preferences");
    initializeRoutePreferences(seed.db);
    sequence = 0;
  });

  function addRoute(patch = {}) {
    const value = { title: "山野线路", category: "山水", days: 2, region: "北京怀柔", difficulty: "休闲", tags: [], status: "on", reviewStatus: "approved", ...patch };
    return Number(seed.db.prepare(`INSERT INTO routes (code,title,category,days,region,difficulty,tags_json,status,review_status)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      "PREF-" + ++sequence, value.title, value.category, value.days, value.region, value.difficulty,
      value.rawTags === undefined ? JSON.stringify(value.tags) : value.rawTags, value.status, value.reviewStatus
    ).lastInsertRowid);
  }

  function option(response, key) {
    return response.body.data.options.find((item) => item.key === key);
  }

  it("returns stable public defaults, including zero-count choices, without management rules", async () => {
    const response = await agent.get("/api/route-preferences").expect(200);
    assert.equal(response.body.data.total, 1);
    assert.deepEqual(response.body.data.options.slice(0, 3), [
      { key: "great-wall", name: "长城", primary: true, count: 1 },
      { key: "hiking", name: "徒步登山", primary: true, count: 0 },
      { key: "coast", name: "海边", primary: true, count: 0 },
    ]);
    assert.equal(response.body.data.options.length, 10);
    assert.equal(response.body.data.options.filter((item) => item.primary).length, 3);
    assert.equal(option(response, "stargazing").count, 0);
    assert.deepEqual(Object.keys(option(response, "family")), ["key", "name", "primary", "count"]);
  });

  it("matches either an exact category or an exact string tag, never partial text or non-array JSON", async () => {
    const byCategory = addRoute({ category: "登山" });
    const byTag = addRoute({ tags: ["登山"] });
    const wallHike = addRoute({ category: "长城", tags: ["徒步", "登山", "徒步"] });
    addRoute({ category: "登山观景", tags: ["轻徒步", "登山摄影"] });
    addRoute({ rawTags: JSON.stringify({ activity: "徒步" }) });
    addRoute({ rawTags: JSON.stringify("徒步") });
    addRoute({ rawTags: "[broken 徒步" });
    addRoute({ rawTags: null });
    const response = await agent.get("/api/routes?preference=hiking").expect(200);
    assert.deepEqual(response.body.data.map((row) => row.id), [byCategory, byTag, wallHike]);
    const counts = await agent.get("/api/route-preferences").expect(200);
    assert.equal(option(counts, "hiking").count, 3);
    assert.equal(option(counts, "great-wall").count, 2);
  });

  it("supports the configured default aliases for scenery, activities and travel companions", async () => {
    const cases = [
      ["hiking", { tags: ["徒步"] }],
      ["coast", { tags: ["海边"] }],
      ["family", { tags: ["亲子"] }],
      ["photography", { tags: ["摄影"] }],
      ["camping", { tags: ["露营"] }],
      ["grassland", { category: "草原" }],
      ["culture", { category: "文化" }],
      ["water", { tags: ["漂流"] }],
      ["stargazing", { tags: ["看星空"] }],
    ];
    for (const [key, value] of cases) {
      const id = addRoute(value);
      const response = await agent.get(`/api/routes?preference=${key}`).expect(200);
      assert.deepEqual(response.body.data.map((row) => row.id), [id], key);
    }
    const response = await agent.get("/api/route-preferences").expect(200);
    assert.ok(response.body.data.options.every((item) => item.count === 1));
    assert.equal(response.body.data.total, 10);
  });

  it("keeps all facet counts aligned with the public route baseline and the current base filters", async () => {
    const coast = addRoute({ title: "北戴河亲子", category: "海滨", tags: ["海边", "亲子"], region: "秦皇岛" });
    const wall = addRoute({ title: "北戴河长城", category: "长城", tags: ["长城", "摄影"], region: "秦皇岛" });
    addRoute({ title: "北戴河未上架", category: "海滨", region: "秦皇岛", status: "off" });
    addRoute({ title: "北戴河待审核", category: "海滨", region: "秦皇岛", reviewStatus: "pending" });
    addRoute({ title: "北戴河未过审", category: "海滨", region: "秦皇岛", reviewStatus: "rejected" });
    addRoute({ title: "北戴河一日", category: "海滨", region: "秦皇岛", days: 1 });
    addRoute({ title: "青岛海边", category: "海滨", region: "秦皇岛" });
    addRoute({ title: "北戴河异地", category: "海滨", region: "其他城市" });
    addRoute({ title: "北戴河进阶", category: "海滨", region: "秦皇岛", difficulty: "进阶" });
    const activity = addRoute({ title: "北戴河同城活动", category: "海滨", region: "秦皇岛" });
    seed.db.prepare("INSERT INTO schedules (route_id,channel,status,review_status) VALUES (?,'activity','cancelled','pending')").run(activity);
    const filters = "days=2&q=北戴河&city=秦皇岛&difficulty=休闲";
    const response = await agent.get(`/api/route-preferences?${filters}&preference=hiking&category=登山&tag=露营`).expect(200);
    assert.equal(response.body.data.total, 2);
    assert.equal(option(response, "coast").count, 1);
    assert.equal(option(response, "great-wall").count, 1);
    assert.equal(option(response, "hiking").count, 0);
    const baseline = await agent.get(`/api/routes?${filters}`).expect(200);
    assert.deepEqual(baseline.body.data.map((row) => row.id), [coast, wall]);
    assert.equal(response.body.data.total, baseline.body.data.length);
    for (const preference of response.body.data.options) {
      const routes = await agent.get(`/api/routes?${filters}&preference=${preference.key}`).expect(200);
      assert.equal(routes.body.data.length, preference.count, preference.key);
    }
  });

  it("combines one preference with keyword and multi-day filters and recognizes legacy null review status", async () => {
    addRoute({ title: "承德山野", category: "登山", days: 3 });
    const wanted = addRoute({ title: "承德山野", tags: ["徒步"], days: 5, reviewStatus: null });
    addRoute({ title: "承德山野", tags: ["徒步"], days: 1 });
    addRoute({ title: "长城山野", category: "登山", days: 5 });
    const routes = await agent.get("/api/routes?preference=hiking&days=multi&q=承德").expect(200);
    assert.deepEqual(routes.body.data.map((row) => row.id), [wanted]);
    const counts = await agent.get("/api/route-preferences?days=multi&q=承德&preference=coast").expect(200);
    assert.equal(counts.body.data.total, 1);
    assert.equal(option(counts, "hiking").count, 1);
  });

  it("rejects missing or disabled preferences and legacy mixing rather than returning an unfiltered list", async () => {
    for (const key of ["missing", "not valid", "' OR 1=1 --"]) {
      const response = await agent.get("/api/routes?preference=" + encodeURIComponent(key)).expect(400);
      assert.equal(response.body.code, "ROUTE_PREFERENCE_UNAVAILABLE");
    }
    seed.db.prepare("UPDATE route_preferences SET status='off' WHERE key='great-wall'").run();
    const disabled = await agent.get("/api/routes?preference=great-wall").expect(400);
    assert.equal(disabled.body.code, "ROUTE_PREFERENCE_UNAVAILABLE");
    const publicList = await agent.get("/api/route-preferences").expect(200);
    assert.equal(option(publicList, "great-wall"), undefined);
    for (const legacy of ["category=长城", "tag=徒步"]) {
      const response = await agent.get(`/api/routes?preference=hiking&${legacy}`).expect(400);
      assert.equal(response.body.code, "ROUTE_PREFERENCE_MIXED_FILTERS");
    }
    await agent.get("/api/routes?preference=hiking&category=&tag=").expect(200);
    const legacy = await agent.get("/api/routes?category=长城&tag=长城").expect(200);
    assert.equal(legacy.body.data[0].id, seed.routeId);
    await agent.get("/api/routes?preference=hiking&preference=coast").expect(400);
    await agent.get("/api/route-preferences?days=invalid").expect(400);
  });

  it("lets operators manage names, ordering, matching and soft disable independently of play tags", async () => {
    const token = await loginAdmin(agent);
    const headers = auth(token);
    await agent.get("/api/play-tags").expect(200);
    const playTags = seed.db.prepare("SELECT * FROM play_tags ORDER BY id").all();
    const wanted = addRoute({ tags: ["星空", "摄影"] });
    addRoute({ tags: ["星空摄影"] });
    const created = await agent.post("/api/admin/route-preferences").set(headers).send({
      key: "night-sky", name: " 夜观星空 ", primary: true, sortOrder: 0, categories: [], tags: [" 星空 ", "星空"],
    }).expect(200);
    assert.deepEqual(created.body.data, { key: "night-sky", name: "夜观星空", primary: true, sortOrder: 0, status: "on", categories: [], tags: ["星空"], count: 1 });
    let publicList = await agent.get("/api/route-preferences").expect(200);
    assert.equal(publicList.body.data.options[0].key, "night-sky");
    const routes = await agent.get("/api/routes?preference=night-sky").expect(200);
    assert.deepEqual(routes.body.data.map((row) => row.id), [wanted]);
    const updated = await agent.put("/api/admin/route-preferences/night-sky").set(headers).send({ name: "夜间摄影", primary: false, sortOrder: 123, categories: ["长城"], tags: ["摄影"] }).expect(200);
    assert.equal(updated.body.data.count, 2);
    assert.equal(updated.body.data.key, "night-sky");
    const disabled = await agent.delete("/api/admin/route-preferences/night-sky").set(headers).expect(200);
    assert.equal(disabled.body.data.status, "off");
    publicList = await agent.get("/api/route-preferences").expect(200);
    assert.equal(option(publicList, "night-sky"), undefined);
    const managed = await agent.get("/api/admin/route-preferences").set(headers).expect(200);
    assert.equal(managed.body.data.find((item) => item.key === "night-sky").count, 2);
    assert.equal(managed.body.data.find((item) => item.key === "night-sky").status, "off");
    assert.equal(seed.db.prepare("SELECT COUNT(*) AS count FROM route_preferences WHERE key='night-sky'").get().count, 1);
    await agent.put("/api/admin/route-preferences/night-sky").set(headers).send({ status: "on" }).expect(200);
    assert.deepEqual(seed.db.prepare("SELECT * FROM play_tags ORDER BY id").all(), playTags);
  });

  it("treats wildcard characters as literal rule members", async () => {
    const token = await loginAdmin(agent);
    const literal = addRoute({ tags: ["观鸟%_'"] });
    addRoute({ tags: ["观鸟任意文字"] });
    await agent.post("/api/admin/route-preferences").set(auth(token)).send({ key: "literal", name: "特殊名称", tags: ["观鸟%_'"] }).expect(200);
    const routes = await agent.get("/api/routes?preference=literal").expect(200);
    assert.deepEqual(routes.body.data.map((row) => row.id), [literal]);
    const counts = await agent.get("/api/route-preferences").expect(200);
    assert.equal(option(counts, "literal").count, 1);
  });

  it("validates configuration and keeps keys immutable", async () => {
    const token = await loginAdmin(agent);
    const headers = auth(token);
    const valid = { key: "birds", name: "观鸟", categories: [], tags: ["看鸟"] };
    const invalid = [
      { key: "" }, { key: "中文" }, { key: "Bad key" }, { key: "a".repeat(65) },
      { name: " " }, { name: "x".repeat(33) }, { name: 123 },
      { categories: "长城" }, { tags: null }, { tags: [null] }, { tags: [1] }, { tags: [""] },
      { tags: ["x".repeat(65)] }, { tags: Array(51).fill("看鸟") }, { categories: [], tags: [] },
      { primary: "false" }, { primary: 1 }, { status: "disabled" },
      { sortOrder: -1 }, { sortOrder: 0.5 }, { sortOrder: "1" }, { sortOrder: 1000001 },
    ];
    for (const patch of invalid) {
      const response = await agent.post("/api/admin/route-preferences").set(headers).send({ ...valid, ...patch }).expect(400);
      assert.equal(response.body.code, "ROUTE_PREFERENCE_INVALID", JSON.stringify(patch));
    }
    await agent.post("/api/admin/route-preferences").set(headers).send(valid).expect(200);
    await agent.post("/api/admin/route-preferences").set(headers).send(valid).expect(409);
    await agent.put("/api/admin/route-preferences/birds").set(headers).send({ key: "other" }).expect(400);
    await agent.put("/api/admin/route-preferences/missing").set(headers).send({ name: "无" }).expect(404);
    await agent.delete("/api/admin/route-preferences/missing").set(headers).expect(404);
    const invalidUpdate = await agent.put("/api/admin/route-preferences/birds").set(headers).send({ categories: [], tags: [] }).expect(400);
    assert.equal(invalidUpdate.body.code, "ROUTE_PREFERENCE_INVALID");
    const routes = await agent.get("/api/route-preferences").expect(200);
    assert.equal(option(routes, "birds").name, "观鸟");
  });

  it("requires roster capability to read management rules and ops capability to write", async () => {
    await agent.get("/api/admin/route-preferences").expect(401);
    const user = signUser({ id: seed.userId, role: "user" });
    await agent.get("/api/admin/route-preferences").set(auth(user)).expect(401);
    const admin = seed.db.prepare("SELECT * FROM admin_users WHERE id=?").get(seed.adminId);
    for (const role of ["photographer", "operator"]) {
      const id = Number(seed.db.prepare("INSERT INTO admin_users (username,password_hash,name,role,status) VALUES (?,?,?,?,?)")
        .run("pref-" + role, admin.password_hash, role, role, "on").lastInsertRowid);
      const token = signAdmin({ id, role });
      await agent.get("/api/admin/route-preferences").set(auth(token)).expect(200);
      const expected = role === "operator" ? 200 : 403;
      await agent.post("/api/admin/route-preferences").set(auth(token)).send({ key: "role-test", name: "权限测试", tags: ["摄影"] }).expect(expected);
      await agent.put("/api/admin/route-preferences/great-wall").set(auth(token)).send({ name: "长城漫步" }).expect(expected);
      await agent.delete("/api/admin/route-preferences/coast").set(auth(token)).expect(expected);
    }
  });

  it("initializes defaults idempotently and preserves edits and soft-disabled defaults across startup", () => {
    const memory = new Database(":memory:");
    try {
      initializeRoutePreferences(memory);
      memory.prepare("UPDATE route_preferences SET name='长城慢行',status='off',tags_json='[\"徒步\"]' WHERE key='great-wall'").run();
      initializeRoutePreferences(memory);
      initializeRoutePreferences(memory);
      assert.equal(memory.prepare("SELECT COUNT(*) AS count FROM route_preferences").get().count, 10);
      const row = memory.prepare("SELECT * FROM route_preferences WHERE key='great-wall'").get();
      assert.equal(row.name, "长城慢行");
      assert.equal(row.status, "off");
      assert.equal(row.tags_json, '["徒步"]');
    } finally {
      memory.close();
    }
  });
});
