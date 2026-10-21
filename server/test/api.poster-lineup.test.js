const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./http");

describe("poster lineup code", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("keeps the selected trips in order and reuses the same code", async () => {
    const ids = [seed.companyScheduleId, seed.individualScheduleId];
    const created = await agent.post("/api/poster-lineups").send({ ids }).expect(200);
    assert.equal(created.body.data.ids.join(","), ids.join(","));
    assert.match(created.body.data.code, /^[A-Za-z0-9_-]{8,16}$/);
    assert.match(created.body.data.qr, /^data:image\/png;base64,/);

    const again = await agent.post("/api/poster-lineups").send({ ids: [ids[1], ids[0], ids[0]] }).expect(200);
    assert.equal(again.body.data.code, created.body.data.code);

    const got = await agent.get(`/api/poster-lineups/${created.body.data.code}`).expect(200);
    assert.deepEqual(
      got.body.data.trips.map((row) => row.id),
      ids
    );
    assert.ok(got.body.data.trips.every((row) => row.route && row.route.title && row.startDate));
  });

  it("rejects a trip that is not on the public list", async () => {
    await agent.post("/api/poster-lineups").send({ ids: [seed.individualScheduleId, 999999] }).expect(400);
    await agent.post("/api/poster-lineups").send({ ids: [] }).expect(400);
    await agent.post("/api/poster-lineups").send({ ids: [1, 2, 3, 4, 5, 6, 7] }).expect(400);
    await agent.get("/api/poster-lineups/not-a-code").expect(404);
  });
});
