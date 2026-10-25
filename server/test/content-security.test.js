const test = require("node:test");
const assert = require("node:assert/strict");
const { textBlocked, imageBlocked, BLOCKED, assertTextSafe } = require("../src/services/content-security");

test("content security blocks risky text and images, and skips the demo login", async () => {
  assert.equal(textBlocked({ errcode: 0, result: { suggest: "risky", label: 20001 } }), true);
  assert.equal(textBlocked({ errcode: 87014 }), true);
  assert.equal(textBlocked({ errcode: 0, result: { suggest: "pass", label: 100 } }), false);
  assert.equal(imageBlocked({ errcode: 87014, errmsg: "risky content" }), true);
  assert.equal(imageBlocked({ errcode: 0, errmsg: "ok" }), false);
  assert.equal(BLOCKED, "所发布内容含违规信息");
  await assertTextSafe("openid", "普通昵称", 1);
});
