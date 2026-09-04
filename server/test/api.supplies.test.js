const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, auth, ID } = require("./http");

describe("bus supplies add-on", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("lists supplies in meta and adds fee to enroll", async () => {
    const meta = await agent.get("/api/meta").expect(200);
    const codes = meta.body.data.supplies.map((p) => p.code);
    assert.ok(codes.includes("nongfu"));

    const token = await loginUser(agent);
    const enrolled = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: seed.individualScheduleId,
        travelerName: "林北野",
        travelerPhone: "13800138000",
        idCard: ID.maleBj,
        emergencyName: "紧急联系人",
        emergencyPhone: "13700000002",
        waiverAccepted: true,
        healthOk: true,
        insuranceCode: "none",
        supplies: [
          { code: "nongfu", qty: 2 },
          { code: "bread", qty: 1 },
        ],
      })
      .expect(200);
    assert.equal(enrolled.body.data.supplies.fee, 12);
    assert.equal(enrolled.body.data.quote.suppliesFee, 12);
    const row = seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(enrolled.body.data.enrollmentId);
    assert.equal(row.supplies_fee, 12);
    assert.equal(row.pay_amount, enrolled.body.data.quote.payAmount);
    assert.match(row.supplies_json, /nongfu/);
  });
});
