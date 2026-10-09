const test = require("node:test");
const assert = require("node:assert/strict");
const { sendVerifySms } = require("../src/services/sms");

test("aliyun verify sms posts the template and does not echo the secret", async () => {
  let body = "";
  await assert.rejects(
    () =>
      sendVerifySms({
        phone: "13800138000",
        code: "123456",
        accessKeyId: "id",
        accessKeySecret: "secret",
        signName: "同行者众",
        templateCode: "SMS_1",
        fetchImpl: async (url, opts) => {
          body = opts.body;
          assert.equal(url, "https://dysmsapi.aliyuncs.com/");
          return { json: async () => ({ Code: "isv.BUSINESS_LIMIT_CONTROL" }) };
        },
      }),
    /短信发送失败/
  );
  assert.match(body, /Action=SendSms/);
  assert.match(body, /TemplateCode=SMS_1/);
  assert.match(body, /123456/);
  assert.doesNotMatch(body, /secret/);
});
