const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./http");

describe("SMS code replacement", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
    const insert = seed.db.prepare("INSERT INTO sms_codes (phone,code,scene,expire_at) VALUES (?,?,'login',datetime('now','localtime','+10 minutes'))");
    insert.run("13800138000", "111111");
    insert.run("13800138000", "222222");
  });

  it("does not reactivate an older code after the newest code is consumed", async () => {
    await agent.post("/api/auth/login-sms").send({ phone: "13800138000", code: "222222" }).expect(200);
    await agent.post("/api/auth/login-sms").send({ phone: "13800138000", code: "111111" }).expect(400);
    const codes = seed.db.prepare("SELECT code,used FROM sms_codes ORDER BY id").all();
    assert.deepEqual(codes, [{ code: "111111", used: 0 }, { code: "222222", used: 1 }]);
  });

  it("does not reactivate an older code after the newest code reaches the attempt limit", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await agent.post("/api/auth/login-sms").send({ phone: "13800138000", code: "000000" }).expect(400);
    }
    await agent.post("/api/auth/login-sms").send({ phone: "13800138000", code: "111111" }).expect(400);
    const codes = seed.db.prepare("SELECT code,used,attempts FROM sms_codes ORDER BY id").all();
    assert.deepEqual(codes, [{ code: "111111", used: 0, attempts: 0 }, { code: "222222", used: 1, attempts: 5 }]);
  });
});
