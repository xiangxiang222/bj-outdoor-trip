const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { queryCampuses, findSchool, SCHOOL_COUNT } = require("../src/services/campuses");
const { harness, loginUser, auth, campusPayload } = require("./http");

describe("beijing campus catalog", () => {
  it("lists Beijing universities with search, aliases and pagination", () => {
    assert.ok(SCHOOL_COUNT >= 80);
    const page1 = queryCampuses({ kind: "school", page: 1, pageSize: 20 });
    assert.equal(page1.list.length, 20);
    assert.equal(page1.pageSize, 20);
    assert.ok(page1.total >= SCHOOL_COUNT);
    assert.equal(page1.list[0].name, "北京大学");

    const alias = queryCampuses({ kind: "school", q: "北大" });
    assert.ok(alias.list.some((row) => row.name === "北京大学"));
    assert.equal(alias.custom, "");

    const exact = queryCampuses({ kind: "school", q: "清华大学" });
    assert.deepEqual(exact.list.map((row) => row.name), ["清华大学"]);
    assert.equal(exact.custom, "");

    const outside = queryCampuses({ kind: "school", q: "河北工业大学" });
    assert.equal(outside.total, 0);
    assert.equal(outside.custom, "河北工业大学");
  });

  it("lists colleges for a school and majors for a college", () => {
    const pku = queryCampuses({ kind: "college", school: "北京大学", q: "信息" });
    assert.ok(pku.list.some((row) => row.name === "信息科学技术学院"));
    assert.ok(findSchool("北大"));

    const voc = queryCampuses({ kind: "college", school: "北京工业职业技术学院" });
    assert.ok(voc.list.some((row) => row.name.includes("系") || row.name.includes("学院")));

    const unknown = queryCampuses({ kind: "college", school: "河北工业大学", q: "计算机" });
    assert.ok(unknown.list.some((row) => row.name === "计算机学院"));

    const majors = queryCampuses({ kind: "major", college: "计算机学院", pageSize: 10 });
    assert.ok(majors.list.some((row) => row.name === "计算机科学与技术"));
    assert.ok(majors.total >= 1);
  });

  it("keeps school → college → major as one-to-many cascades", () => {
    const noSchool = queryCampuses({ kind: "college" });
    assert.equal(noSchool.total, 0);
    assert.equal(noSchool.list.length, 0);
    const typed = queryCampuses({ kind: "college", q: "未来学院" });
    assert.equal(typed.total, 0);
    assert.equal(typed.custom, "未来学院");

    const mixed = queryCampuses({ kind: "college", school: "北京大学，清华大学", q: "元培" });
    assert.ok(mixed.list.some((row) => row.name === "元培学院"));
    const wudaokou = queryCampuses({ kind: "college", school: "北京大学，清华大学", q: "五道口" });
    assert.ok(wudaokou.list.some((row) => row.name === "五道口金融学院"));
    const police = queryCampuses({ kind: "college", school: "北京大学，清华大学", q: "侦查" });
    assert.equal(police.total, 0);

    const noCollege = queryCampuses({ kind: "major", school: "北京大学" });
    assert.equal(noCollege.total, 0);

    const cs = queryCampuses({ kind: "major", school: "北京大学", college: "计算机学院" });
    assert.ok(cs.list.some((row) => row.name === "计算机科学与技术"));
    const art = queryCampuses({ kind: "major", school: "清华大学", college: "美术学院", pageSize: 20 });
    assert.ok(art.list.some((row) => row.name === "美术学" || row.name === "绘画"));
    assert.ok(!art.list.some((row) => row.name === "计算机科学与技术"));
  });

  it("rejects unknown kinds", () => {
    assert.throws(() => queryCampuses({ kind: "grade" }), /school、college 或 major/);
  });
});

describe("GET /campuses and optional campus certification", () => {
  let agent;

  beforeEach(() => {
    ({ agent } = harness());
  });

  it("exposes the catalog without login", async () => {
    const res = await agent.get("/api/campuses?kind=school&q=清华&pageSize=5").expect(200);
    assert.ok(res.body.data.list.some((row) => row.name === "清华大学"));
    const colleges = await agent.get("/api/campuses").query({ kind: "college", school: "清华大学", q: "计算机" }).expect(200);
    assert.ok(colleges.body.data.list.length >= 1);
    const cascade = await agent.get("/api/campuses").query({ kind: "college", school: "北京大学，清华大学", q: "元培" }).expect(200);
    assert.ok(cascade.body.data.list.some((row) => row.name === "元培学院"));
    const needSchool = await agent.get("/api/campuses").query({ kind: "college" }).expect(200);
    assert.equal(needSchool.body.data.total, 0);
    const bad = await agent.get("/api/campuses?kind=grade").expect(400);
    assert.match(bad.body.message, /school/);
  });

  it("lets school, college and major stay empty but still requires a card", async () => {
    const token = await loginUser(agent);
    const missingCard = await agent.post("/api/me/student").set(auth(token)).send({
      school: "",
      college: "",
      studentNo: "1700012345",
      studentCardUrl: "",
    });
    assert.equal(missingCard.status, 400);
    assert.match(missingCard.body.message, /学生证/);

    const short = await agent.post("/api/me/student").set(auth(token)).send(campusPayload({ school: "北" }));
    assert.equal(short.status, 400);
    assert.match(short.body.message, /学校/);

    const ok = await agent
      .post("/api/me/student")
      .set(auth(token))
      .send(campusPayload({ school: "", college: "", major: "计算机科学与技术" }))
      .expect(200);
    assert.equal(ok.body.data.school, "");
    assert.equal(ok.body.data.college, "");
    assert.equal(ok.body.data.major, "计算机科学与技术");
    assert.equal(ok.body.data.studentStatus, "pending");
  });
});
