const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getDb } = require("../src/db");
const { harness, loginAdmin, auth } = require("./http");
const {
  collectRouteStrings,
  applyEnglishPayload,
  requestLang,
  translateRouteById,
  scheduleRouteI18n,
} = require("../src/services/route-i18n");

function jsonRes(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  };
}

describe("route english", () => {
  it("collects route copy and leaves short labels out", () => {
    const strings = collectRouteStrings({
      title: "香山夜爬看灯",
      subtitle: "测试",
      description: "晚上从北门上山。\n\n山顶看北京城。",
      highlights_json: JSON.stringify(["亮点", "夜景很好"]),
      itinerary_json: JSON.stringify([{ time: "19:30", title: "出发", detail: "北门集合上车" }]),
      fee_include: "车费",
      equipment: "运动鞋",
      meetup_json: JSON.stringify([{ name: "东直门东方银座C口" }]),
    });
    assert.ok(strings.includes("香山夜爬看灯"));
    assert.ok(strings.includes("晚上从北门上山。"));
    assert.ok(strings.includes("山顶看北京城。"));
    assert.ok(strings.includes("夜景很好"));
    assert.ok(strings.includes("北门集合上车"));
    assert.ok(strings.includes("东直门东方银座C口"));
    assert.equal(strings.includes("测试"), false);
    assert.equal(strings.includes("出发"), false);
    assert.equal(strings.includes("亮点"), false);
  });

  it("replaces saved phrases and keeps city and tag filters in Chinese", () => {
    const map = { 香山夜爬看灯: "Xiangshan night hike" };
    const body = applyEnglishPayload(
      {
        title: "香山夜爬看灯",
        city: "北京",
        region: "怀柔",
        tags: ["香山夜爬看灯"],
        blurb: "今晚 香山夜爬看灯",
      },
      map
    );
    assert.equal(body.title, "Xiangshan night hike");
    assert.equal(body.city, "北京");
    assert.equal(body.region, "怀柔");
    assert.deepEqual(body.tags, ["香山夜爬看灯"]);
    assert.equal(body.blurb, "今晚 Xiangshan night hike");
  });

  it("reads the language header", () => {
    assert.equal(requestLang({ get: () => "en", query: {} }), "en");
    assert.equal(requestLang({ get: () => "zh-Hant", query: {} }), "tw");
    assert.equal(requestLang({ get: () => "", query: {} }), "zh");
  });

  it("stores english from the model and does not call it again", async () => {
    const db = getDb();
    const id = Number(
      db.prepare("INSERT INTO routes (code,title,description,status) VALUES (?,?,?,?)").run(
        `I18N${Date.now()}`,
        "香山夜爬看灯",
        "晚上从北门上山，山顶看北京。",
        "on"
      ).lastInsertRowid
    );
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return jsonRes({
        choices: [
          {
            message: {
              content: JSON.stringify({
                香山夜爬看灯: "Xiangshan night hike",
                "晚上从北门上山，山顶看北京。": "Climb from the north gate at night and see Beijing from the summit.",
              }),
            },
          },
        ],
      });
    };
    const saved = await translateRouteById(id, { apiKey: "test-key", fetchImpl });
    assert.equal(saved["香山夜爬看灯"], "Xiangshan night hike");
    assert.equal(calls, 1);
    await translateRouteById(id, {
      apiKey: "test-key",
      fetchImpl: async () => {
        throw new Error("should not translate again");
      },
    });
    assert.equal(calls, 1);
  });

  it("keeps the Chinese route when no model key is configured", async () => {
    const db = getDb();
    const id = Number(
      db.prepare("INSERT INTO routes (code,title,description,status) VALUES (?,?,?,?)").run(
        `I18N0${Date.now()}`,
        "未配置密钥的新路线",
        "这条介绍应该继续是中文。",
        "on"
      ).lastInsertRowid
    );
    const saved = await translateRouteById(id, { apiKey: "" });
    assert.equal(saved, null);
    const row = db.prepare("SELECT i18n_json FROM routes WHERE id=?").get(id);
    assert.equal(row.i18n_json, null);
    scheduleRouteI18n(id);
  });

  it("serves stored english to readers and leaves the admin editor in Chinese", async () => {
    const { agent } = harness();
    const db = getDb();
    const row = db.prepare("SELECT id, title FROM routes WHERE code=?").get("R01");
    db.prepare("UPDATE routes SET i18n_json=? WHERE id=?").run(
      JSON.stringify({ sourceHash: "test", en: { [row.title]: "Mutianyu cable car day trip" } }),
      row.id
    );
    const zh = await agent.get("/api/home").expect(200);
    assert.ok(JSON.stringify(zh.body).includes(row.title));
    const en = await agent.get("/api/home").set("X-Lang", "en").expect(200);
    const packed = JSON.stringify(en.body);
    assert.ok(packed.includes("Mutianyu cable car day trip"));
    assert.equal(packed.includes(row.title), false);
    assert.ok(en.body.data.cities.some((city) => city.name === "怀柔"));
    const admin = await loginAdmin(agent);
    const editor = await agent.get("/api/admin/routes").set("X-Lang", "en").set(auth(admin)).expect(200);
    assert.ok(editor.body.data.some((route) => route.title === row.title));
  });
});
