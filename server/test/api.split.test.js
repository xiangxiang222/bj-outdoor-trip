const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginCompany, loginAdmin, auth, ID } = require("./http");

describe("payment split", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("splits company settlement among platform, guide and merchant", async () => {
    const userToken = await loginUser(agent);
    await agent.post("/api/enroll").set(auth(userToken)).send({
      scheduleId: seed.companyScheduleId,
      travelerName: "同事",
      travelerPhone: "13800138000",
      idCard: ID.maleBj,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    });
    const companyToken = await loginCompany(agent);
    const settled = await agent
      .post("/api/pay/company-settle")
      .set(auth(companyToken))
      .send({ scheduleId: seed.companyScheduleId })
      .expect(200);
    assert.ok(settled.body.data.splits.length >= 3);
    const sum = settled.body.data.splits.reduce((s, r) => s + r.amount, 0);
    assert.equal(sum, settled.body.data.total);
    const platform = settled.body.data.splits.find((r) => r.party === "platform");
    assert.ok(platform.amount > 0);

    const adminToken = await loginAdmin(agent);
    const listed = await agent.get(`/api/admin/schedules/${seed.companyScheduleId}/splits`).set(auth(adminToken)).expect(200);
    assert.equal(listed.body.data.length, 3);
    const again = await agent.post(`/api/admin/schedules/${seed.companyScheduleId}/split`).set(auth(adminToken)).expect(200);
    assert.equal(again.body.data.reused, true);
  });
});
