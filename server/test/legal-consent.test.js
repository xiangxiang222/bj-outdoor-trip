const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { harness, issueCaptcha, auth } = require("./http");
const { signUser } = require("../src/middleware/auth");
const legal = require("../src/services/legal");
const { SCOPE } = require("../src/services/legal-consent");

const originalBundle = legal.legalBundle;

describe("legal documents and ordinary agreement consent", () => {
  let agent, seed, bundle;
  const consent = () => ({ accepted: true, version: bundle.version });
  const count = () => seed.db.prepare("SELECT COUNT(*) AS n FROM legal_consents").get().n;
  async function passwordLogin(extra = {}, expected = 200) {
    const cap = await issueCaptcha(agent);
    return agent.post("/api/auth/login").send({ phone: "13800138000", password: "123456", captchaToken: cap.token, captcha: cap.code, legalConsent: consent(), ...extra }).expect(expected);
  }

  beforeEach(() => {
    ({ agent, seed } = harness());
    seed.db.exec("DELETE FROM legal_consents; DELETE FROM legal_versions;");
    bundle = { version: "2026-11-01", updatedAt: "2026-11-01", effectiveAt: "2026-11-01", status: "published", notice: "", operator: { name: "测试运营主体", address: "测试地址", email: "privacy@example.invalid" }, documents: [{ id: "terms", title: "用户协议", sections: [{ title: "范围", paragraphs: ["测试用户协议"] }] }, { id: "privacy", title: "隐私政策", sections: [{ title: "范围", paragraphs: ["测试隐私政策"] }] }] };
    legal.legalBundle = () => bundle;
  });

  afterEach(() => {
    legal.legalBundle = originalBundle;
    seed.db.exec("DELETE FROM legal_consents; DELETE FROM legal_versions;");
  });

  it("serves the current document bundle without login or caching", async () => {
    bundle.status = "draft";
    seed.db.prepare("UPDATE routes SET i18n_json=? WHERE id=?").run(JSON.stringify({ en: { "测试用户协议": "AI-rewritten agreement" } }), seed.routeId);
    const result = await agent.get("/api/legal").expect(200);
    assert.deepEqual(result.body.data, bundle);
    assert.equal(result.headers["cache-control"], "no-store");
    const english = await agent.get("/api/legal").set("X-Lang", "en").expect(200);
    assert.deepEqual(english.body.data, bundle);
    assert.equal(count(), 0);
  });

  it("never records draft documents as accepted, including forged client acceptance", async () => {
    bundle.status = "draft";
    await passwordLogin({ legalConsent: undefined });
    await passwordLogin({ legalConsent: { accepted: true, version: "forged" } });
    assert.equal(count(), 0);
    assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM legal_versions").get().n, 0);
  });

  it("rejects missing or stale acceptance on every ordinary auth route before consuming verification or calling providers", async () => {
    const cap = await issueCaptcha(agent);
    seed.db.prepare("INSERT INTO sms_codes(phone,code,scene,expire_at) VALUES(?,?,?,datetime('now','localtime','+5 minutes'))").run("13500135077", "888888", "login");
    const initialUsers = seed.db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
    const originalFetch = global.fetch;
    let fetchCalls = 0;
    global.fetch = async () => { fetchCalls += 1; throw new Error("Unexpected external request"); };
    try {
      for (const route of ["sms", "register", "login", "login-sms", "wechat-phone", "wechat"]) {
        const payload = { phone: "13500135077", password: "123456", code: "888888", phoneCode: "13500135077", captchaToken: cap.token, captcha: cap.code };
        const missing = await agent.post(`/api/auth/${route}`).send(payload).expect(400);
        assert.equal(missing.body.code, "legal_consent_required");
        const stale = await agent.post(`/api/auth/${route}`).send({ ...payload, legalConsent: { accepted: true, version: "old" } }).expect(409);
        assert.equal(stale.body.code, "legal_version_changed");
      }
      const invalidToken = await agent.post("/api/auth/wechat").set(auth("invalid-token")).send({ code: "test" }).expect(400);
      assert.equal(invalidToken.body.code, "legal_consent_required");
      assert.equal(fetchCalls, 0);
      assert.equal(seed.db.prepare("SELECT used FROM captchas WHERE token=?").get(cap.token).used, 0);
      assert.equal(seed.db.prepare("SELECT used FROM sms_codes WHERE phone=?").get("13500135077").used, 0);
      assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM sms_codes").get().n, 1);
      assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM users").get().n, initialUsers);
      assert.equal(count(), 0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("requires an explicit boolean acceptance and an exact string version", async () => {
    for (const accepted of [false, "true", 1, null]) {
      await agent.post("/api/auth/wechat").send({ code: "test", legalConsent: { accepted, version: bundle.version } }).expect(400);
    }
    for (const version of [null, 20261101, `${bundle.version} `]) {
      await agent.post("/api/auth/wechat").send({ code: "test", legalConsent: { accepted: true, version } }).expect(409);
    }
    assert.equal(count(), 0);
  });

  it("does not treat sending a code or failed authentication as acceptance", async () => {
    await agent.post("/api/auth/sms").send({ phone: "13500135078", legalConsent: consent() }).expect(200);
    await agent.post("/api/auth/login-sms").send({ phone: "13500135078", code: "000000", legalConsent: consent() }).expect(400);
    await passwordLogin({ password: "incorrect" }, 400);
    assert.equal(count(), 0);
    assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM legal_versions").get().n, 0);
  });

  it("archives immutable text, its SHA-256, server UTC time and the first successful channel idempotently", async () => {
    const before = Date.now();
    const result = await passwordLogin();
    await passwordLogin();
    const row = seed.db.prepare("SELECT c.*,v.snapshot_json,v.snapshot_sha256 FROM legal_consents c JOIN legal_versions v USING(version)").get();
    assert.equal(row.user_id, result.body.data.user.id);
    assert.equal(row.version, bundle.version);
    assert.equal(row.scope, SCOPE);
    assert.equal(row.channel, "password");
    assert.match(row.accepted_at, /^\d{4}-\d{2}-\d{2}T.*Z$/);
    assert.ok(Date.parse(row.accepted_at) >= before && Date.parse(row.accepted_at) <= Date.now());
    assert.deepEqual(JSON.parse(row.snapshot_json), bundle);
    assert.equal(row.snapshot_sha256, crypto.createHash("sha256").update(row.snapshot_json).digest("hex"));
    assert.equal(count(), 1);
    assert.throws(() => seed.db.prepare("UPDATE legal_versions SET snapshot_json='altered' WHERE version=?").run(bundle.version), /immutable/);
    assert.deepEqual(seed.db.prepare("PRAGMA table_info(legal_consents)").all().map((col) => col.name), ["id", "user_id", "version", "scope", "channel", "accepted_at"]);
  });

  it("records successful password registration, SMS registration/login and both WeChat login methods", async () => {
    const cap = await issueCaptcha(agent);
    await agent.post("/api/auth/register").send({ phone: "13500135079", password: "123456", captchaToken: cap.token, captcha: cap.code, legalConsent: consent() }).expect(200);
    await agent.post("/api/auth/sms").send({ phone: "13500135080", scene: "register", legalConsent: consent() }).expect(200);
    await agent.post("/api/auth/register").send({ phone: "13500135080", password: "123456", smsCode: "888888", legalConsent: consent() }).expect(200);
    await agent.post("/api/auth/sms").send({ phone: "13500135081", legalConsent: consent() }).expect(200);
    await agent.post("/api/auth/login-sms").send({ phone: "13500135081", code: "888888", legalConsent: consent() }).expect(200);
    await agent.post("/api/auth/wechat").send({ code: "legal-consent-demo", legalConsent: consent() }).expect(200);
    await agent.post("/api/auth/wechat-phone").send({ loginCode: "legal-phone-demo", phoneCode: "13500135082", legalConsent: consent() }).expect(200);
    assert.deepEqual(seed.db.prepare("SELECT channel FROM legal_consents ORDER BY id").all().map((row) => row.channel), ["register", "register", "sms", "wechat", "wechat_phone"]);
  });

  it("preserves signed-in WeChat payment binding without creating an account or inventing consent", async () => {
    const user = seed.db.prepare("SELECT * FROM users WHERE id=?").get(seed.userId);
    const before = seed.db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
    const result = await agent.post("/api/auth/wechat").set(auth(signUser(user))).send({ code: "legal-binding-demo" }).expect(200);
    assert.equal(result.body.data.bound, true);
    assert.equal(result.body.data.user.id, user.id);
    assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM users").get().n, before);
    assert.equal(count(), 0);
  });

  it("keeps the independent guide SMS flow available without ordinary-user acceptance", async () => {
    const cap = await issueCaptcha(agent);
    await agent.post("/api/auth/sms").send({ phone: "13700001101", scene: "guide", captchaToken: cap.token, captcha: cap.code }).expect(200);
    assert.equal(count(), 0);
  });

  it("rejects changed content under an archived version before consuming a captcha, then archives a newly versioned revision", async () => {
    await passwordLogin();
    const archived = seed.db.prepare("SELECT * FROM legal_versions").get();
    bundle = { ...bundle, notice: "内容已修订" };
    const cap = await issueCaptcha(agent);
    const conflict = await agent.post("/api/auth/login").send({ phone: "13800138000", password: "123456", captchaToken: cap.token, captcha: cap.code, legalConsent: consent() }).expect(409);
    assert.equal(conflict.body.code, "legal_version_conflict");
    assert.equal(seed.db.prepare("SELECT used FROM captchas WHERE token=?").get(cap.token).used, 0);
    assert.deepEqual(seed.db.prepare("SELECT * FROM legal_versions").get(), archived);
    bundle = { ...bundle, version: "2026-11-02" };
    await passwordLogin();
    assert.equal(count(), 2);
    assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM legal_versions").get().n, 2);
    assert.equal(seed.db.prepare("SELECT snapshot_json FROM legal_versions WHERE version=?").get("2026-11-01").snapshot_json, archived.snapshot_json);
  });
});
