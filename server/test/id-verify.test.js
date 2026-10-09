const test = require("node:test");
const assert = require("node:assert/strict");
const { signRpc, verifyIdentity } = require("../src/services/id-verify");

test("aliyun signature is stable for the same parameters", () => {
  const params = { Action: "Id2MetaVerify", UserName: "林", IdentifyNum: "110101199003078515" };
  assert.equal(signRpc(params, "secret"), signRpc(params, "secret"));
  assert.notEqual(signRpc(params, "secret"), signRpc(params, "other"));
});

test("configured keys call Id2MetaVerify and reject a mismatch", async () => {
  let body = "";
  const fetchImpl = async (url, opts) => {
    body = opts.body;
    assert.equal(url, "https://cloudauth.aliyuncs.com/");
    return { json: async () => ({ Code: "200", ResultObject: { BizCode: "2" } }) };
  };
  await assert.rejects(
    () =>
      verifyIdentity(
        { realName: "林北野", idCard: "110101199003078515" },
        { accessKeyId: "id", accessKeySecret: "secret", fetchImpl, now: new Date("2026-10-09T02:00:00Z") }
      ),
    /姓名与身份证号不一致/
  );
  assert.match(body, /Action=Id2MetaVerify/);
  assert.match(body, /UserName=/);
  assert.doesNotMatch(body, /secret/);
});

test("live server without keys refuses verification", async () => {
  await assert.rejects(
    () => verifyIdentity({ realName: "林北野", idCard: "110101199003078515" }, { loginLive: true, accessKeyId: "", accessKeySecret: "" }),
    /实名核验尚未开通/
  );
});

test("demo server still accepts demo-ok and rejects demo-bad", async () => {
  const ok = await verifyIdentity(
    { realName: "林北野", idCard: "110101199003078515", code: "demo-ok" },
    { loginLive: false, accessKeyId: "", accessKeySecret: "" }
  );
  assert.equal(ok.demo, true);
  await assert.rejects(
    () =>
      verifyIdentity(
        { realName: "林北野", idCard: "110101199003078515", code: "demo-bad" },
        { loginLive: false, accessKeyId: "", accessKeySecret: "" }
      ),
    /姓名与身份证号不一致/
  );
});
