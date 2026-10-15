const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildRouteTemplate, buildDocx, parseRouteTemplate } = require("../src/services/route-template");
const { unzip } = require("../src/services/docx-zip");
const { harness, loginAdmin, auth } = require("./http");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "route-template-"));
}

function img(n = 1) {
  return Array.from({ length: n }, () => ({ image: PNG, ext: ".png" }));
}

describe("route docx template", () => {
  it("embeds a photo with the drawing markup Word displays", () => {
    const buf = buildDocx(["封面", { image: PNG, ext: ".png" }]);
    const xml = unzip(buf)["word/document.xml"].toString("utf8");
    assert.match(xml, /<wp:extent cx="9525" cy="9525"\/>/);
    assert.match(xml, /<a:blip r:embed="rIdImg1"\/>/);
    const dir = tmpDir();
    const parsed = parseRouteTemplate(buf, { destDir: dir });
    assert.match(parsed.cover, /^\/static\/uploads\/.+\.png$/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes a blank template whose hints are not imported", () => {
    const buf = buildRouteTemplate();
    const files = unzip(buf);
    const xml = files["word/document.xml"].toString("utf8");
    assert.match(xml, /标题/);
    assert.match(xml, /说明：线路名称/);
    assert.match(xml, /图说：/);
    const dir = tmpDir();
    const parsed = parseRouteTemplate(buf, { destDir: dir });
    assert.equal(parsed.title, "");
    assert.equal(parsed.days, null);
    assert.deepEqual(parsed.gallery, []);
    assert.deepEqual(parsed.warnings, []);
    assert.equal(parsed.cover, "");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reads deflated Chinese headings and ignores hint lines", () => {
    const buf = buildDocx(
      [
        { text: "标题", bold: true },
        "说明：不要导入这行",
        "青崖子一日",
        "天数",
        "2日",
        "地区",
        "北京市 / 怀柔区",
      ],
      { method: 8 }
    );
    const dir = tmpDir();
    const parsed = parseRouteTemplate(buf, { destDir: dir });
    assert.equal(parsed.title, "青崖子一日");
    assert.equal(parsed.days, 2);
    assert.equal(parsed.region, "北京市 / 怀柔区");
    assert.deepEqual(parsed.warnings, []);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("maps one-line headings, photos, prices, buses and trims over the caps", () => {
    const blocks = [
      "标题：青崖子",
      "副标题：山脊看湖",
      "类型：登山",
      "难度：进阶",
      "季节：4-10月",
      "里程：18",
      "成团人数：12人",
      "标签：长城、一日，纯玩",
      "封面",
      ...img(2),
      "相册",
      ...img(9),
      "视频",
      "https://www.bilibili.com/video/BV1xx",
      "不是链接",
      "亮点",
      "看山",
      "看水",
      "看路",
      "看树",
      "看云",
      "看星",
      "第七条不导入",
      "介绍",
      "第一段",
      "第二段",
      ...img(1),
      "图文",
      "走到山梁",
      ...img(1),
      "图说：山梁上的风",
      ...img(6),
      "行程",
      "07:30｜市区集合",
      "在C口上车",
      ...img(2),
      "次日 08:00｜下山",
      "按原路返回",
      "阶梯价",
      "10人起｜299｜284",
      "20｜259",
      "车型：30人中巴、10人考斯特、直升机",
      "集合点",
      "东直门东方银座C口｜07:30｜地铁2号线C口",
      "费用含",
      "往返车",
      "费用不含",
      "午餐",
      "装备",
      "登山鞋",
      "注意事项",
      "注意天气",
      "退款",
      "出发前全退",
    ];
    const dir = tmpDir();
    const parsed = parseRouteTemplate(buildDocx(blocks), { destDir: dir });
    assert.equal(parsed.title, "青崖子");
    assert.equal(parsed.subtitle, "山脊看湖");
    assert.equal(parsed.category, "登山");
    assert.equal(parsed.difficulty, "进阶");
    assert.equal(parsed.season, "4-10月");
    assert.equal(parsed.distanceKm, 18);
    assert.equal(parsed.minGroupSize, 12);
    assert.deepEqual(parsed.tags, ["长城", "一日", "纯玩"]);
    assert.match(parsed.cover, /^\/static\/uploads\/.+\.png$/);
    assert.equal(fs.existsSync(path.join(dir, path.basename(parsed.cover))), true);
    assert.equal(parsed.gallery.length, 8);
    assert.deepEqual(parsed.videos, ["https://www.bilibili.com/video/BV1xx"]);
    assert.equal(parsed.highlights.length, 6);
    assert.equal(parsed.highlights[0], "看山");
    assert.match(parsed.description, /第一段/);
    assert.match(parsed.description, /第二段/);
    assert.equal(parsed.story.filter((block) => block.type === "image").length, 6);
    assert.equal(parsed.story[0].type, "text");
    assert.equal(parsed.story[0].body, "走到山梁");
    assert.equal(parsed.story[1].caption, "山梁上的风");
    assert.equal(parsed.itinerary.length, 2);
    assert.equal(parsed.itinerary[0].time, "07:30");
    assert.equal(parsed.itinerary[0].title, "市区集合");
    assert.equal(parsed.itinerary[0].detail, "在C口上车");
    assert.match(parsed.itinerary[0].photo, /^\/static\/uploads\/.+\.png$/);
    assert.equal(parsed.itinerary[1].time, "次日 08:00");
    assert.equal(parsed.itinerary[1].photo, "");
    assert.deepEqual(parsed.priceTiers, [
      { minPeople: 10, price: 299, memberPrice: 284 },
      { minPeople: 20, price: 259, memberPrice: null },
    ]);
    assert.deepEqual(parsed.buses, ["bus30", "coaster10"]);
    assert.equal(parsed.meetupPoints[0].name, "东直门东方银座C口");
    assert.equal(parsed.meetupPoints[0].timeHint, "07:30");
    assert.equal(parsed.meetupPoints[0].geo, "地铁2号线C口");
    assert.equal(parsed.feeInclude, "往返车");
    assert.equal(parsed.feeExclude, "午餐");
    assert.equal(parsed.equipment, "登山鞋");
    assert.equal(parsed.notices, "注意天气");
    assert.ok(parsed.warnings.includes("封面只导入第 1 张"));
    assert.ok(parsed.warnings.includes("相册只导入前 8 张"));
    assert.ok(parsed.warnings.includes("图文只导入前 6 张"));
    assert.ok(parsed.warnings.includes("亮点只导入前 6 条"));
    assert.ok(parsed.warnings.includes("有一条视频不是链接，已跳过"));
    assert.ok(parsed.warnings.includes("每一站只导入 1 张配图"));
    assert.ok(parsed.warnings.includes("未识别的车型：直升机"));
    assert.ok(parsed.warnings.includes("退款仍用全站规则，模板里的退款没有导入"));
    assert.ok(parsed.warnings.some((item) => item.includes("介绍")));
    assert.equal(parsed.notices.includes("出发前全退"), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("downloads the blank template and imports a filled one", async () => {
    const { agent } = harness();
    const token = await loginAdmin(agent);
    await agent.get("/api/admin/routes/template").expect(401);
    const blank = await agent
      .get("/api/admin/routes/template")
      .set(auth(token))
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    assert.equal(blank.headers["content-type"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.equal(blank.body[0], 0x50);
    assert.equal(blank.body[1], 0x4b);
    const doc = buildDocx(["标题：接口测试线", "天数", "1日", "封面", { image: PNG, ext: ".png" }]);
    const imported = await agent.post("/api/admin/routes/import").set(auth(token)).attach("file", doc, "路线.docx").expect(200);
    assert.equal(imported.body.data.title, "接口测试线");
    assert.equal(imported.body.data.days, 1);
    assert.match(imported.body.data.cover, /^\/static\/uploads\/.+\.png$/);
    await agent
      .post("/api/admin/routes/import")
      .set(auth(token))
      .attach("file", Buffer.from("not a docx"), "note.txt")
      .expect(400);
  });

  it("skips a photo larger than 5MB and rejects a file that is not docx", () => {
    const huge = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    const dir = tmpDir();
    const parsed = parseRouteTemplate(buildDocx(["封面", { image: huge, ext: ".jpg" }]), { destDir: dir });
    assert.equal(parsed.cover, "");
    assert.ok(parsed.warnings.some((item) => item.includes("超过 5MB")));
    assert.throws(() => parseRouteTemplate(Buffer.from("hello"), { destDir: dir }), /Word/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
