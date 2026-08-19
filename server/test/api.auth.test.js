const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, auth, issueCaptcha, ID } = require("./http");

describe("auth and profile API", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("returns product meta", async () => {
    const res = await agent.get("/api/meta").expect(200);
    assert.equal(res.body.data.name, "北野行");
    assert.deepEqual(res.body.data.days, [1, 2, 3, 5]);
    assert.equal(res.body.data.smsDemoCode, "888888");
  });

  it("serves spa fallback for non-api get", async () => {
    const spa = await agent.get("/m/orders").expect(200);
    assert.match(spa.text, /spa/);
    const cap = await issueCaptcha(agent);
    const login = await agent
      .post("/api/auth/login")
      .send({ phone: "13800138000", password: "123456", captchaToken: cap.token, captcha: cap.code })
      .expect(200);
    assert.ok(login.body.data.token);
  });

  it("rejects invalid phone for sms", async () => {
    await agent.post("/api/auth/sms").send({ phone: "123" }).expect(400);
  });

  it("registers with phone, image captcha and password then logs in", async () => {
    const badPwd = await agent.post("/api/auth/register").send({ phone: "13600136000", password: "123" });
    assert.equal(badPwd.status, 400);
    const noCode = await agent
      .post("/api/auth/register")
      .send({ phone: "13600136000", password: "123456", nickname: "新用户" });
    assert.equal(noCode.status, 400);
    const first = await issueCaptcha(agent);
    assert.match(first.image, /^data:image\/png;base64,/);
    const png = await agent.get(`/api/auth/captcha-image/${first.token}`).expect(200);
    assert.match(String(png.headers["content-type"] || ""), /png/);
    const listed = await agent.get("/api/auth/captcha").expect(200);
    assert.equal(listed.body.data.code, undefined);
    const wrong = await agent.post("/api/auth/register").send({
      phone: "13600136000",
      password: "123456",
      nickname: "新用户",
      captchaToken: first.token,
      captcha: "XXXX",
    });
    assert.equal(wrong.status, 400);
    const reused = await agent.post("/api/auth/register").send({
      phone: "13600136000",
      password: "123456",
      nickname: "新用户",
      captchaToken: first.token,
      captcha: first.code,
    });
    assert.equal(reused.status, 400);
    const cap = await issueCaptcha(agent);
    const created = await agent
      .post("/api/auth/register")
      .send({
        phone: "13600136000",
        password: "123456",
        nickname: "新用户",
        captchaToken: cap.token,
        captcha: cap.code.toLowerCase(),
      })
      .expect(200);
    assert.ok(created.body.data.token);
    assert.equal(created.body.data.user.nickname, "新用户");
    const dup = await agent.post("/api/auth/register").send({
      phone: "13600136000",
      password: "123456",
      captchaToken: cap.token,
      captcha: cap.code,
    });
    assert.equal(dup.status, 400);
    const loginCap = await issueCaptcha(agent);
    const login = await agent
      .post("/api/auth/login")
      .send({ phone: "13600136000", password: "123456", captchaToken: loginCap.token, captcha: loginCap.code })
      .expect(200);
    assert.ok(login.body.data.token);
  });

  it("rejects login without captcha or with wrong password", async () => {
    const noCap = await agent.post("/api/auth/login").send({ phone: "13800138000", password: "123456" });
    assert.equal(noCap.status, 400);
    const cap = await issueCaptcha(agent);
    const wrongPwd = await agent.post("/api/auth/login").send({
      phone: "13800138000",
      password: "wrong",
      captchaToken: cap.token,
      captcha: cap.code,
    });
    assert.equal(wrongPwd.status, 400);
  });

  it("logs in by sms and auto-creates user", async () => {
    await agent.post("/api/auth/sms").send({ phone: "13500135000", scene: "login" }).expect(200);
    const res = await agent.post("/api/auth/login-sms").send({ phone: "13500135000", code: "888888" }).expect(200);
    assert.match(res.body.data.user.nickname, /北野行5000/);
    await agent.post("/api/auth/login-sms").send({ phone: "13500135000", code: "000000" }).expect(400);
  });

  it("wechat demo login", async () => {
    const res = await agent.post("/api/auth/wechat").send({ code: "demo_code", nickname: "微信游客" }).expect(200);
    assert.equal(res.body.data.user.nickname, "微信游客");
    const again = await agent.post("/api/auth/wechat").send({ code: "demo_code" }).expect(200);
    assert.equal(again.body.data.user.id, res.body.data.user.id);
  });

  it("requires login for /me and updates profile from id card", async () => {
    await agent.get("/api/me").expect(401);
    const token = await loginUser(agent);
    const me = await agent.get("/api/me").set(auth(token)).expect(200);
    assert.equal(me.body.data.phone, "13800138000");
    const updated = await agent
      .put("/api/me")
      .set(auth(token))
      .send({ nickname: "林改名", idCard: "130102198805201218", companyName: "个人工作室" })
      .expect(200);
    assert.equal(updated.body.data.nickname, "林改名");
    assert.equal(updated.body.data.hometown, "河北省石家庄市");
    assert.match(updated.body.data.idCardMasked, /130102\*{8}/);
  });

  it("deletes account and allows the same phone to register again", async () => {
    const token = await loginUser(agent);
    await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: seed.individualScheduleId,
        travelerName: "林北野",
        travelerPhone: "13800138000",
        idCard: ID.maleBj,
        emergencyName: "紧急联系人",
        emergencyPhone: "13700000002",
        waiverAccepted: true,
        healthOk: true,
      })
      .expect(200);
    await agent.delete("/api/me").set(auth(token)).expect(200);
    await agent.get("/api/me").set(auth(token)).expect(401);
    const loginCap = await issueCaptcha(agent);
    const login = await agent.post("/api/auth/login").send({
      phone: "13800138000",
      password: "123456",
      captchaToken: loginCap.token,
      captcha: loginCap.code,
    });
    assert.equal(login.status, 400);
    const cap = await issueCaptcha(agent);
    const created = await agent
      .post("/api/auth/register")
      .send({
        phone: "13800138000",
        password: "123456",
        nickname: "新林北野",
        captchaToken: cap.token,
        captcha: cap.code,
      })
      .expect(200);
    assert.equal(created.body.data.user.nickname, "新林北野");
  });
});
