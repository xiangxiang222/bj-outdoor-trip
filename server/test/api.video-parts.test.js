const fs = require("fs");
const path = require("path");
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./http");
const { PART_SIZE } = require("../src/services/video-parts");
const config = require("../src/config");

const TOKEN = "bot-test-token";

function botAuth() {
  return { Authorization: `Bearer ${TOKEN}` };
}

function mp4(size) {
  const buf = Buffer.alloc(size);
  buf.write("ftyp", 4, "ascii");
  return buf;
}

describe("bot video parts", () => {
  let agent;
  let previous;
  const created = [];

  beforeEach(() => {
    previous = process.env.BOT_INGEST_TOKEN;
    process.env.BOT_INGEST_TOKEN = TOKEN;
    ({ agent } = harness());
  });

  afterEach(() => {
    for (const url of created.splice(0)) {
      const name = path.basename(url);
      fs.rmSync(path.join(config.publicDir, "static", "uploads", name), { force: true });
      fs.rmSync(path.join(config.publicDir, "static", "uploads", `${name}.assembling`), { force: true });
    }
    if (previous == null) delete process.env.BOT_INGEST_TOKEN;
    else process.env.BOT_INGEST_TOKEN = previous;
  });

  it("assembles the original bytes after each part arrives", async () => {
    const file = mp4(PART_SIZE + 20);
    const denied = await agent.post("/api/bot/videos/sessions").send({ size: file.length }).expect(401);
    assert.match(denied.body.message, /密钥/);

    const opened = await agent.post("/api/bot/videos/sessions").set(botAuth()).send({ size: file.length }).expect(200);
    assert.equal(opened.body.data.partSize, PART_SIZE);
    assert.equal(opened.body.data.parts, 2);
    const id = opened.body.data.id;

    const short = await agent
      .post(`/api/bot/videos/sessions/${id}/parts/0`)
      .set(botAuth())
      .set("Content-Type", "application/octet-stream")
      .send(file.subarray(0, 10))
      .expect(400);
    assert.match(short.body.message, /大小不对/);

    const early = await agent.post(`/api/bot/videos/sessions/${id}/finish`).set(botAuth()).expect(400);
    assert.match(early.body.message, /还缺段 0、1/);

    await agent
      .post(`/api/bot/videos/sessions/${id}/parts/1`)
      .set(botAuth())
      .set("Content-Type", "application/octet-stream")
      .send(file.subarray(PART_SIZE))
      .expect(200);
    const mid = await agent.get(`/api/bot/videos/sessions/${id}`).set(botAuth()).expect(200);
    assert.deepEqual(mid.body.data.have, [1]);

    await agent
      .post(`/api/bot/videos/sessions/${id}/parts/0`)
      .set(botAuth())
      .set("Content-Type", "application/octet-stream")
      .send(file.subarray(0, PART_SIZE))
      .expect(200);

    const done = await agent.post(`/api/bot/videos/sessions/${id}/finish`).set(botAuth()).expect(200);
    assert.match(done.body.data.url, /^\/static\/uploads\/botv-.+\.mp4$/);
    created.push(done.body.data.url);
    const saved = fs.readFileSync(path.join(config.publicDir, done.body.data.url.replace(/^\//, "")));
    assert.equal(Buffer.compare(saved, file), 0);

    const again = await agent.post(`/api/bot/videos/sessions/${id}/finish`).set(botAuth()).expect(200);
    assert.equal(again.body.data.url, done.body.data.url);
    const status = await agent.get(`/api/bot/videos/sessions/${id}`).set(botAuth()).expect(200);
    assert.equal(status.body.data.done, true);
    assert.equal(status.body.data.url, done.body.data.url);
  });

  it("rejects an oversized file, a bad segment, and a file that is not mp4", async () => {
    const big = await agent.post("/api/bot/videos/sessions").set(botAuth()).send({ size: 33 * 1024 * 1024 }).expect(400);
    assert.match(big.body.message, /32MB/);
    await agent.post("/api/bot/videos/sessions").set(botAuth()).send({ size: 0 }).expect(400);

    const opened = await agent.post("/api/bot/videos/sessions").set(botAuth()).send({ size: 32 }).expect(200);
    const id = opened.body.data.id;
    await agent
      .post(`/api/bot/videos/sessions/${id}/parts/3`)
      .set(botAuth())
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.alloc(32))
      .expect(400);

    const junk = Buffer.alloc(32);
    junk.write("not a video");
    await agent
      .post(`/api/bot/videos/sessions/${id}/parts/0`)
      .set(botAuth())
      .set("Content-Type", "application/octet-stream")
      .send(junk)
      .expect(200);
    const bad = await agent.post(`/api/bot/videos/sessions/${id}/finish`).set(botAuth()).expect(400);
    assert.match(bad.body.message, /mp4/);
  });
});
