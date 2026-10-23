const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginAdmin, auth, ID, campusPayload } = require("./http");

describe("campus gender ratio", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  async function approveStudent(token, userId, school, college) {
    await agent.post("/api/me/student").set(auth(token)).send(campusPayload({ school, college })).expect(200);
    const admin = await loginAdmin(agent);
    await agent.post(`/api/admin/users/${userId}/verify`).set(auth(admin)).send({ kind: "student", action: "approve" }).expect(200);
  }

  function enroll(token, idCard) {
    return agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard,
      emergencyName: "紧急联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    });
  }

  it("blocks the gender that has no seats at that school", async () => {
    seed.db.prepare("UPDATE schedules SET organizer_type='campus', company_name='北京大学' WHERE id=?").run(seed.individualScheduleId);
    const admin = await loginAdmin(agent);
    const saved = await agent
      .put(`/api/admin/schedules/${seed.individualScheduleId}/limit`)
      .set(auth(admin))
      .send({
        campusTargets: [
          { school: "北京大学", college: "" },
          { school: "清华大学", college: "" },
        ],
        genderRatio: {
          on: true,
          overall: { male: 1, female: 1 },
          schools: [{ school: "北京大学", male: 0, female: 1 }],
        },
      })
      .expect(200);
    assert.equal(saved.body.data.genderRatio.on, true);
    assert.equal(saved.body.data.genderRatio.schools[0].school, "北京大学");

    const token = await loginUser(agent);
    await approveStudent(token, seed.userId, "北京大学", "信息学院");
    const blocked = await enroll(token, ID.maleBj);
    assert.equal(blocked.status, 400);
    assert.match(blocked.body.message, /北京大学的男生名额已满/);

    const ok = await enroll(token, ID.femaleBj).expect(200);
    assert.ok(ok.body.data.enrollmentId);
  });
});
