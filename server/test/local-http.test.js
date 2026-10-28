const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const localRequest = require("./local-http");

describe("isolated loopback HTTP transport", () => {
  it("binds the same IPv4 loopback interface used by the client", async () => {
    const req = localRequest((_req, res) => res.end("owned-listener")).get("/test");
    assert.equal(new URL(req.url).hostname, "127.0.0.1");
    assert.equal(req.app.address().address, "127.0.0.1");
    assert.equal(req.app.address().family, "IPv4");
    assert.equal((await req.expect(200)).text, "owned-listener");
  });

  it("uses the fresh application supplied by the next harness", async () => {
    const res = await localRequest((_req, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ app: "next" }));
    }).get("/test").expect(200);
    assert.deepEqual(res.body, { app: "next" });
  });
});
