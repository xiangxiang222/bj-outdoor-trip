const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, auth, ID } = require("./http");

describe("insurance add-on", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("lists plans in meta and adds fee to individual enroll", async () => {
    const meta = await agent.get("/api/meta").expect(200);
    const codes = meta.body.data.insurance.map((p) => p.code);
    assert.deepEqual(codes, ["none", "outdoor", "plus"]);

    const token = await loginUser(agent);
    const enrolled = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: seed.individualScheduleId,
        travelerName: "林北野",
        travelerPhone: "13800138000",
        idCard: ID.maleBj,
        insuranceCode: "plus",
      })
      .expect(200);
    assert.equal(enrolled.body.data.insurance.code, "plus");
    assert.equal(enrolled.body.data.insurance.fee, 48);
    assert.equal(enrolled.body.data.quote.insuranceFee, 48);
    assert.ok(enrolled.body.data.quote.payAmount >= 48);
    const row = seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(enrolled.body.data.enrollmentId);
    assert.equal(row.insurance_code, "plus");
    assert.equal(row.insurance_fee, 48);
    assert.equal(row.pay_amount, enrolled.body.data.quote.payAmount);
  });
});
