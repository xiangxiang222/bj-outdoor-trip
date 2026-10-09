const test = require("node:test");
const assert = require("node:assert/strict");
const { sendVerifySms, tc3Authorization } = require("../src/services/sms");

test("tencent tc3 signature matches the published sample", () => {
  const secretId = `AKID${"*".repeat(32)}`;
  const secretKey = "*".repeat(32);
  const payload = '{"Limit": 1, "Filters": [{"Values": ["\\u672a\\u547d\\u540d"], "Name": "instance-name"}]}';
  const authorization = tc3Authorization({
    secretId,
    secretKey,
    service: "cvm",
    host: "cvm.tencentcloudapi.com",
    action: "DescribeInstances",
    payload,
    timestamp: 1551113065,
  });
  assert.equal(
    authorization,
    "TC3-HMAC-SHA256 Credential=AKID********************************/2019-02-25/cvm/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=10b1a37a7301a02ca19a647ad722d5e43b4b3cff309d421d85b46093f6ab6c4f"
  );
});

test("tencent verify sms posts the template and does not echo the secret", async () => {
  let body = "";
  let headers = {};
  await assert.rejects(
    () =>
      sendVerifySms({
        phone: "13800138000",
        code: "123456",
        secretId: "AKIDexample",
        secretKey: "secret-key-value",
        sdkAppId: "1400006666",
        signName: "同行者众",
        templateId: "1110",
        timestamp: 1551113065,
        fetchImpl: async (url, opts) => {
          body = opts.body;
          headers = opts.headers;
          assert.equal(url, "https://sms.tencentcloudapi.com/");
          return { json: async () => ({ Response: { SendStatusSet: [{ Code: "FailedOperation.TemplateIncorrectOrUnapproved" }] } }) };
        },
      }),
    /短信发送失败/
  );
  const parsed = JSON.parse(body);
  assert.deepEqual(parsed.PhoneNumberSet, ["+8613800138000"]);
  assert.equal(parsed.SmsSdkAppId, "1400006666");
  assert.equal(parsed.SignName, "同行者众");
  assert.equal(parsed.TemplateId, "1110");
  assert.deepEqual(parsed.TemplateParamSet, ["123456"]);
  assert.match(headers.Authorization, /^TC3-HMAC-SHA256 /);
  assert.equal(headers["X-TC-Action"], "SendSms");
  assert.equal(headers["X-TC-Version"], "2021-01-11");
  assert.doesNotMatch(body, /secret-key-value/);
  assert.doesNotMatch(headers.Authorization, /secret-key-value/);
});
