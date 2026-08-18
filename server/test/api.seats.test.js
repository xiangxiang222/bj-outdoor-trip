const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { seatLayout } = require("../src/services/seats");
const { harness, loginUser, auth, ID } = require("./http");

describe("seat layout", () => {
  it("builds a 2+2 coach map", () => {
    const ten = seatLayout(10);
    assert.equal(ten.seats.length, 10);
    assert.equal(ten.seats[0].no, "1A");
    assert.equal(ten.seats[1].aisleAfter, true);
    assert.equal(ten.seats[9].no, "3B");
  });
});

describe("seat map API", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("auto-assigns the first free seat and rejects a taken one", async () => {
    const token = await loginUser(agent);
    const first = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: seed.individualScheduleId,
        travelerName: "林北野",
        travelerPhone: "13800138000",
        idCard: ID.maleBj,
        seatNo: "1A",
      })
      .expect(200);
    assert.equal(first.body.data.seatNo, "1A");

    const taken = await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "B",
      travelerPhone: "13800138000",
      idCard: ID.femaleBj,
      seatNo: "1A",
    });
    assert.equal(taken.status, 400);
    assert.match(taken.body.message, /占用/);

    const second = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: seed.individualScheduleId,
        travelerName: "B",
        travelerPhone: "13800138000",
        idCard: ID.femaleBj,
      })
      .expect(200);
    assert.equal(second.body.data.seatNo, "1B");

    const seats = await agent.get(`/api/schedules/${seed.individualScheduleId}/seats`).set(auth(token)).expect(200);
    const map = seats.body.data.seats;
    assert.equal(map.find((s) => s.no === "1A").taken, true);
    assert.equal(map.find((s) => s.no === "1A").mine, true);
    assert.equal(map.find((s) => s.no === "1C").taken, false);

    const bad = await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "C",
      travelerPhone: "13800138000",
      idCard: ID.maleHb,
      seatNo: "9Z",
    });
    assert.equal(bad.status, 400);
  });
});
