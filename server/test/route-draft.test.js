const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  inferCategory,
  placeNameOf,
  templateDraft,
  parseJsonObject,
  normalizeLlmDraft,
  llmDraft,
  isUsableSearchPhoto,
  matchPlaces,
  searchQueries,
  localLibraryPhotos,
  searchAndSavePhotos,
  draftRoute,
} = require("../src/services/route-draft");

function jsonRes(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  };
}

describe("route draft copy", () => {
  it("infers category and strips day words from the title", () => {
    assert.equal(inferCategory("慕田峪长城一日游", ""), "长城");
    assert.equal(inferCategory("乌兰布统坝上", ""), "草原");
    assert.equal(inferCategory("北戴河看海", ""), "海滨");
    assert.equal(inferCategory("拒马河漂流", ""), "玩水");
    assert.equal(inferCategory("爨底下村", ""), "文化");
    assert.equal(inferCategory("灵山徒步", ""), "登山");
    assert.equal(inferCategory("周末出门", "玩水"), "玩水");
    assert.equal(inferCategory("周末出门", ""), "山水");
    assert.equal(inferCategory("周末山水", ""), "山水");
    assert.equal(placeNameOf("慕田峪长城缆车一日游"), "慕田峪长城");
  });

  it("writes a usable template when no model key is set", () => {
    const draft = templateDraft({
      title: "慕田峪长城一日游",
      region: "北京市 / 怀柔区",
      days: 1,
      notes: "亲子，摄影",
    });
    assert.equal(draft.category, "长城");
    assert.equal(draft.difficulty, "休闲");
    assert.match(draft.subtitle, /1日长城/);
    assert.ok(draft.tags.includes("亲子"));
    assert.ok(draft.tags.includes("摄影"));
    assert.equal(draft.itinerary.length, 3);
    assert.match(draft.description, /怀柔/);
  });

  it("uses overnight itinerary and 进阶 when the title says so", () => {
    const draft = templateDraft({ title: "灵山徒步两日游", days: 2, notes: "进阶" });
    assert.equal(draft.category, "登山");
    assert.equal(draft.difficulty, "进阶");
    assert.equal(draft.itinerary.length, 4);
    assert.equal(draft.season, "4-10月");
  });

  it("parses model JSON even when wrapped in fences", () => {
    assert.deepEqual(parseJsonObject('```json\n{"subtitle":"好"}\n```'), { subtitle: "好" });
    assert.equal(parseJsonObject("not json"), null);
    assert.equal(parseJsonObject("{"), null);
  });

  it("fills missing model fields from the template", () => {
    const draft = normalizeLlmDraft(
      {
        subtitle: "自己写的副标题",
        category: "长城",
        difficulty: "进阶线路",
        highlights: ["城墙"],
        itinerary: [{ time: "08:00", title: "出发", detail: "集合" }],
        fee_include: "车",
      },
      { title: "慕田峪", days: 1 }
    );
    assert.equal(draft.subtitle, "自己写的副标题");
    assert.equal(draft.difficulty, "进阶");
    assert.deepEqual(draft.highlights, ["城墙"]);
    assert.equal(draft.feeInclude, "车");
    assert.ok(draft.description);
    assert.equal(normalizeLlmDraft("nope", { title: "慕田峪" }), null);
  });
});

describe("route draft model and photos", () => {
  it("returns null from llmDraft when no key or the request fails", async () => {
    assert.equal(await llmDraft({ title: "慕田峪" }, { apiKey: "" }), null);
    assert.equal(await llmDraft({ title: "慕田峪" }, { apiKey: "k", fetchImpl: async () => jsonRes({}, false) }), null);
    assert.equal(
      await llmDraft(
        { title: "慕田峪" },
        {
          apiKey: "k",
          fetchImpl: async () => {
            throw new Error("down");
          },
        }
      ),
      null
    );
  });

  it("reads a chat completion payload", async () => {
    const draft = await llmDraft(
      { title: "慕田峪长城", days: 1, region: "北京市 / 怀柔区" },
      {
        apiKey: "k",
        fetchImpl: async () =>
          jsonRes({
            choices: [{ message: { content: JSON.stringify({ subtitle: "AI 副标题", category: "长城", description: "模型写的介绍" }) } }],
          }),
      }
    );
    assert.equal(draft.subtitle, "AI 副标题");
    assert.equal(draft.description, "模型写的介绍");
    assert.equal(draft.category, "长城");
  });

  it("filters unusable search photos", () => {
    assert.equal(isUsableSearchPhoto("慕田峪长城", "https://img.baidu.com/it/u=1"), true);
    assert.equal(isUsableSearchPhoto("景区logo", "https://img.baidu.com/it/u=1"), false);
    assert.equal(isUsableSearchPhoto("风景", "https://x.com/a.svg"), false);
    assert.equal(isUsableSearchPhoto("风景", ""), false);
  });

  it("matches known places and searches Chinese names, not district names", () => {
    const hits = matchPlaces({ title: "慕田峪长城一日游", region: "北京市 / 海淀区" });
    assert.ok(hits.some((row) => row.id === "mutianyu"));
    assert.equal(matchPlaces({ title: "周末山水", region: "北京市 / 海淀区" }).length, 0);
    const queries = searchQueries({ title: "慕田峪长城一日游", region: "北京市 / 海淀区", category: "长城" });
    assert.ok(queries.includes("慕田峪长城"));
    assert.ok(!queries.includes("海淀区"));
    assert.ok(!queries.some((q) => /Mutianyu/i.test(q)));
  });

  it("reuses local place photos when the title hits a known album", () => {
    const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), "bj-lib-"));
    const photoDir = path.join(publicDir, "static", "photos");
    fs.mkdirSync(photoDir, { recursive: true });
    fs.writeFileSync(path.join(photoDir, "mutianyuLift.jpg"), Buffer.alloc(9000, 7));
    fs.writeFileSync(path.join(photoDir, "mutianyu.jpg"), Buffer.alloc(9000, 8));
    const urls = localLibraryPhotos({ title: "慕田峪长城一日游" }, { publicDir, limit: 4 });
    assert.deepEqual(urls, ["/static/photos/mutianyuLift.jpg", "/static/photos/mutianyu.jpg"]);
  });

  it("downloads usable Baidu photos and skips junk", async () => {
    const destDir = fs.mkdtempSync(path.join(os.tmpdir(), "bj-draft-"));
    let calls = 0;
    const fetchImpl = async (url) => {
      calls += 1;
      if (String(url).includes("wisejsonala")) {
        return jsonRes({
          data: [
            { title: "慕田峪", thumburl: "http://x/wall.jpg" },
            { title: "景区logo", thumburl: "http://x/logo.png" },
            { title: "远景", thumburl: "http://x/tiny.jpg" },
          ],
        });
      }
      if (String(url).includes("tiny.jpg")) {
        return { ok: true, arrayBuffer: async () => Buffer.from("tiny") };
      }
      return { ok: true, arrayBuffer: async () => Buffer.alloc(9000, 7) };
    };
    const urls = await searchAndSavePhotos({ title: "周末山水" }, { fetchImpl, destDir, limit: 2 });
    assert.equal(urls.length, 1);
    assert.match(urls[0], /^\/static\/uploads\/ai-.+\.jpg$/);
    assert.equal(fs.existsSync(path.join(destDir, path.basename(urls[0]))), true);
    assert.ok(calls >= 2);
  });

  it("returns no photos when remote search fails", async () => {
    const destDir = fs.mkdtempSync(path.join(os.tmpdir(), "bj-draft-"));
    const urls = await searchAndSavePhotos(
      { title: "慕田峪" },
      {
        destDir,
        fetchImpl: async () => jsonRes({}, false),
      }
    );
    assert.deepEqual(urls, []);
  });

  it("falls back to the local album when remote search is blocked", async () => {
    const destDir = fs.mkdtempSync(path.join(os.tmpdir(), "bj-draft-"));
    const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), "bj-pub-"));
    const photoDir = path.join(publicDir, "static", "photos");
    fs.mkdirSync(photoDir, { recursive: true });
    fs.writeFileSync(path.join(photoDir, "mutianyuLift.jpg"), Buffer.alloc(9000, 7));
    const urls = await searchAndSavePhotos(
      { title: "慕田峪长城一日游" },
      {
        destDir,
        publicDir,
        limit: 2,
        fetchImpl: async () => jsonRes({}, false),
      }
    );
    assert.deepEqual(urls, ["/static/photos/mutianyuLift.jpg"]);
  });

  it("downloads 360 photos when Baidu has nothing", async () => {
    const destDir = fs.mkdtempSync(path.join(os.tmpdir(), "bj-draft-"));
    const urls = await searchAndSavePhotos(
      { title: "周末山水" },
      {
        destDir,
        limit: 1,
        fetchImpl: async (url) => {
          if (String(url).includes("image.so.com")) {
            return jsonRes({ list: [{ title: "湖", img: "http://x/lake.jpg" }] });
          }
          if (String(url).includes("lake.jpg")) {
            return { ok: true, arrayBuffer: async () => Buffer.alloc(9000, 3) };
          }
          return jsonRes({ data: [] });
        },
      }
    );
    assert.equal(urls.length, 1);
    assert.match(urls[0], /^\/static\/uploads\/ai-.+\.jpg$/);
  });

  it("skips a file when the image url is missing or the download throws", async () => {
    const destDir = fs.mkdtempSync(path.join(os.tmpdir(), "bj-draft-"));
    const empty = await searchAndSavePhotos(
      { title: "周末山水" },
      {
        destDir,
        fetchImpl: async (url) => {
          if (String(url).includes("wisejsonala")) {
            return jsonRes({ data: [{ title: "空", thumburl: "" }] });
          }
          return jsonRes({ data: [], list: [] });
        },
      }
    );
    assert.deepEqual(empty, []);
    const thrown = await searchAndSavePhotos(
      { title: "周末山水" },
      {
        destDir,
        fetchImpl: async (url) => {
          if (String(url).includes("wisejsonala")) {
            return jsonRes({ data: [{ title: "湖", thumburl: "http://x/wall.jpg" }] });
          }
          throw new Error("net");
        },
      }
    );
    assert.deepEqual(thrown, []);
  });

  it("does not hit the network during unit tests without a fetch mock", async () => {
    assert.deepEqual(await searchAndSavePhotos({ title: "慕田峪" }), []);
  });

  it("returns null when the model answers with non-json", async () => {
    const draft = await llmDraft(
      { title: "慕田峪" },
      { apiKey: "k", fetchImpl: async () => jsonRes({ choices: [{ message: { content: "not json" } }] }) }
    );
    assert.equal(draft, null);
  });
});

describe("draftRoute", () => {
  it("rejects a blank title", async () => {
    await assert.rejects(() => draftRoute({ title: "  " }), /请填写标题/);
  });

  it("uses the template and injected photos", async () => {
    const draft = await draftRoute(
      { title: "慕田峪长城一日游", region: "北京市 / 怀柔区", days: 1 },
      { searchPhotos: async () => ["/static/uploads/a.jpg", "/static/uploads/b.jpg"] }
    );
    assert.equal(draft.source, "template");
    assert.equal(draft.cover, "/static/uploads/a.jpg");
    assert.deepEqual(draft.gallery, ["/static/uploads/a.jpg", "/static/uploads/b.jpg"]);
    assert.equal(draft.photoSource, "search");
    assert.equal(draft.category, "长城");
  });

  it("keeps copy when the model works and photos fail", async () => {
    const draft = await draftRoute(
      { title: "慕田峪" },
      {
        llmDraft: async () => ({ ...templateDraft({ title: "慕田峪" }), subtitle: "模型" }),
        searchPhotos: async () => {
          throw new Error("commons down");
        },
      }
    );
    assert.equal(draft.source, "llm");
    assert.equal(draft.subtitle, "模型");
    assert.deepEqual(draft.gallery, []);
    assert.equal(draft.photoSource, "");
  });

  it("drafts from the template without live net in unit tests", async () => {
    const draft = await draftRoute({ title: "周末山水", days: 5 });
    assert.equal(draft.source, "template");
    assert.equal(draft.category, "山水");
    assert.match(draft.subtitle, /多日/);
    assert.deepEqual(draft.gallery, []);
  });

  it("falls back to the template when the model throws", async () => {
    const draft = await draftRoute(
      { title: "周末山水" },
      {
        llmDraft: async () => {
          throw new Error("boom");
        },
        searchPhotos: async () => "bad",
      }
    );
    assert.equal(draft.source, "template");
    assert.equal(draft.category, "山水");
    assert.deepEqual(draft.gallery, []);
  });
});
