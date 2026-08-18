const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createApp } = require("../src/app");
const { seedMinimal } = require("./helpers");

describe("createApp spa hosting", () => {
  it("can disable spa fallback", async () => {
    seedMinimal();
    process.env.MMC_SKIP_WEB = "1";
    try {
      const app = createApp();
      const res = await request(app).get("/no-such-page");
      assert.equal(res.status, 404);
    } finally {
      process.env.MMC_SKIP_WEB = "0";
    }
  });
});
