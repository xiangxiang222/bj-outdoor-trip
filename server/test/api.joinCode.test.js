const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { getDb } = require("../src/db");
const { resolveJoinCode, joinCodesMatch, PRIVATE_LABEL } = require("../src/services/joinCode");
const { harness, loginUser, auth, ID, enrollPayload } = require("./http");

describe("encrypted trip join code", () => {
  it("treats blank as public and generates a 6-char code when flagged", () => {
    assert.equal(resolveJoinCode({}), "");
    const auto = resolveJoinCode({ privateJoin: true });
    assert.match(auto, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(resolveJoinCode({ joinCode: " 慕田峪周末 " }), "慕田峪周末");
    assert.equal(joinCodesMatch("Ab12Cd", "ab12cd"), true);
    assert.throws(() => resolveJoinCode({ privateJoin: true, joinCode: "ab" }), /4～16/);
  });

  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("marks 加密团, hides the code from strangers, and requires it to enroll", async () => {
    const host = await loginUser(agent);
    const created = await agent
      .post("/api/schedules")
      .set(auth(host))
      .send({
        routeId: seed.routeId,
        startDate: "2099-11-01",
        busTypeId: "coaster10",
        organizerType: "individual",
        meetupPoint: "东直门东方银座C口",
        privateJoin: true,
        joinCode: "长城口令",
      })
      .expect(200);
    assert.equal(created.body.data.private, true);
    assert.equal(created.body.data.privateLabel, PRIVATE_LABEL);
    assert.equal(created.body.data.joinCode, "长城口令");

    const id = created.body.data.id;
    const guest = await agent.get("/api/schedules/" + id).expect(200);
    assert.equal(guest.body.data.private, true);
    assert.equal(guest.body.data.privateLabel, PRIVATE_LABEL);
    assert.equal(guest.body.data.joinCodeRequired, true);
    assert.equal(guest.body.data.joinCode, undefined);

    const listed = await agent.get("/api/schedules?channel=trip").expect(200);
    const card = (listed.body.data || []).find((s) => s.id === id);
    assert.ok(card);
    assert.equal(card.private, true);
    assert.equal(card.joinCode, undefined);

    const guestUser = await loginUser(agent, "13900139000");
    await agent
      .post("/api/enroll")
      .set(auth(guestUser))
      .send(
        enrollPayload({
          scheduleId: id,
          travelerName: "华创",
          travelerPhone: "13900139000",
          idCard: ID.maleHb,
        })
      )
      .expect(400);
    await agent
      .post("/api/enroll")
      .set(auth(guestUser))
      .send(
        enrollPayload({
          scheduleId: id,
          travelerName: "华创",
          travelerPhone: "13900139000",
          idCard: ID.maleHb,
          joinCode: "错口令",
        })
      )
      .expect(400);
    const ok = await agent
      .post("/api/enroll")
      .set(auth(guestUser))
      .send(
        enrollPayload({
          scheduleId: id,
          travelerName: "华创",
          travelerPhone: "13900139000",
          idCard: ID.maleHb,
          joinCode: "长城口令",
        })
      )
      .expect(200);
    assert.equal(ok.body.data.enrollmentId > 0, true);

    const joined = await agent.get("/api/schedules/" + id).set(auth(guestUser)).expect(200);
    assert.equal(joined.body.data.joinCode, "长城口令");
  });

  it("lets the organizer enroll a locked trip without typing the code", async () => {
    const host = await loginUser(agent);
    getDb().prepare("UPDATE schedules SET join_code=? WHERE id=?").run("SECRET1", seed.individualScheduleId);
    const res = await agent
      .post("/api/enroll")
      .set(auth(host))
      .send(
        enrollPayload({
          scheduleId: seed.individualScheduleId,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
        })
      )
      .expect(200);
    assert.ok(res.body.data.enrollmentId);
  });
});
