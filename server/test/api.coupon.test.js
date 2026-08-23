const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginCompany, loginAdmin, auth, ID, enrollPayload, issueCaptcha } = require("./http");

function enrollBody(extra = {}) {
  return enrollPayload({
    travelerName: extra.travelerName || "林北野",
    travelerPhone: extra.travelerPhone || "13800138000",
    idCard: extra.idCard || ID.maleBj,
    ...extra,
  });
}

describe("coupons", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  async function issueAmount(total = 2, value = 50) {
    const admin = await loginAdmin(agent);
    const created = await agent
      .post("/api/admin/coupons")
      .set(auth(admin))
      .send({
        scheduleId: seed.individualScheduleId,
        kind: "amount",
        value,
        total,
        name: "测试满减券",
      })
      .expect(200);
    return { admin, campaign: created.body.data };
  }

  it("admin issues public coupon and short link redirects", async () => {
    const { campaign } = await issueAmount();
    assert.ok(campaign.code);
    assert.equal(campaign.kind, "amount");
    assert.equal(campaign.remain, 2);
    const listed = await agent.get("/api/admin/coupons").set(auth(await loginAdmin(agent))).expect(200);
    assert.equal(listed.body.data.length, 1);
    const detail = await agent.get(`/api/admin/coupons/${campaign.id}`).set(auth(await loginAdmin(agent))).expect(200);
    assert.match(detail.body.data.share.shortUrl, /\/c\//);
    assert.match(detail.body.data.share.qr, /^data:image\/png;base64,/);
    const jump = await agent.get(`/c/${campaign.code}`).redirects(0);
    assert.equal(jump.status, 302);
    assert.equal(jump.headers.location, `/m/coupon/${campaign.code}`);
  });

  it("rejects company tours and requires percent cap", async () => {
    const admin = await loginAdmin(agent);
    const company = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.companyScheduleId,
      kind: "amount",
      value: 20,
      total: 5,
    });
    assert.equal(company.status, 400);
    const nocap = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "percent",
      fold: 8,
      total: 5,
    });
    assert.equal(nocap.status, 400);
    const ok = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "percent",
      fold: 8,
      capAmount: 40,
      total: 5,
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.value, 80);
    assert.equal(ok.body.data.label, "8折");
  });

  it("claims once per user and decrements stock", async () => {
    const { campaign } = await issueAmount(1, 40);
    const token = await loginUser(agent);
    const guest = await agent.get(`/api/coupons/${campaign.code}`).expect(200);
    assert.equal(guest.body.data.remain, 1);
    assert.equal(guest.body.data.claimedByMe, false);
    const first = await agent.post(`/api/coupons/${campaign.code}/claim`).set(auth(token)).expect(200);
    assert.equal(first.body.data.claimedByMe, true);
    assert.equal(first.body.data.remain, 0);
    const again = await agent.post(`/api/coupons/${campaign.code}/claim`).set(auth(token)).expect(200);
    assert.match(again.body.message, /已领取/);
    const cap = await issueCaptcha(agent);
    const other = await agent.post("/api/auth/register").send({
      phone: "13600136011",
      password: "123456",
      nickname: "领券乙",
      captchaToken: cap.token,
      captcha: cap.code,
    }).expect(200);
    const sold = await agent.post(`/api/coupons/${campaign.code}/claim`).set(auth(other.body.data.token));
    assert.equal(sold.status, 400);
    assert.match(sold.body.message, /领完/);
  });

  it("applies coupon vs member as the lower price, never stacking", async () => {
    const { campaign } = await issueAmount(5, 50);
    const token = await loginUser(agent);
    const enrolled = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        ...enrollBody({ scheduleId: seed.individualScheduleId }),
        couponCode: campaign.code,
        insuranceCode: "none",
      })
      .expect(200);
    assert.equal(enrolled.body.data.quote.couponApplied, true);
    assert.equal(enrolled.body.data.quote.payAmount, 149);
    const uc = seed.db.prepare("SELECT * FROM user_coupons WHERE user_id=?").get(seed.userId);
    assert.equal(uc.status, "used");
    assert.equal(Number(uc.used_enrollment_id), enrolled.body.data.enrollmentId);
  });

  it("skips coupon when member 95% is cheaper or equal", async () => {
    const { campaign } = await issueAmount(5, 5);
    const token = await loginUser(agent);
    const enrolled = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        ...enrollBody({ scheduleId: seed.individualScheduleId }),
        couponCode: campaign.code,
        insuranceCode: "none",
      })
      .expect(200);
    assert.equal(enrolled.body.data.quote.couponApplied, false);
    assert.equal(enrolled.body.data.quote.payAmount, 189);
    const uc = seed.db.prepare("SELECT * FROM user_coupons WHERE user_id=?").get(seed.userId);
    assert.equal(uc.status, "unused");
  });

  it("does not redeem coupon when gift trip applies", async () => {
    const cap = await issueCaptcha(agent);
    const created = await agent.post("/api/auth/register").send({
      phone: "13600136012",
      password: "123456",
      nickname: "赠送券",
      captchaToken: cap.token,
      captcha: cap.code,
    }).expect(200);
    const token = created.body.data.token;
    await agent.post("/api/member/buy").set(auth(token)).expect(200);
    seed.db.prepare("UPDATE schedules SET offer_type='deal', offer_price=80 WHERE id=?").run(seed.individualScheduleId);
    const { campaign } = await issueAmount(3, 30);
    const enrolled = await agent.post("/api/enroll").set(auth(token)).send({
      ...enrollBody({
        scheduleId: seed.individualScheduleId,
        travelerName: "赠送券",
        travelerPhone: "13600136012",
        idCard: ID.femaleSd,
      }),
      couponCode: campaign.code,
      insuranceCode: "none",
    }).expect(200);
    assert.equal(enrolled.body.data.quote.giftApplied, true);
    assert.equal(enrolled.body.data.quote.couponApplied, false);
    assert.equal(enrolled.body.data.quote.payAmount, 0);
    const uid = created.body.data.user.id;
    const uc = seed.db.prepare("SELECT * FROM user_coupons WHERE user_id=?").get(uid);
    assert.equal(uc.status, "unused");
  });

  it("holds coupon on waitlist and redeems after promote, releases on cancel", async () => {
    seed.db.prepare("UPDATE schedules SET max_seats=1 WHERE id=?").run(seed.individualScheduleId);
    const { campaign } = await issueAmount(5, 50);
    const token = await loginUser(agent);
    const first = await agent.post("/api/enroll").set(auth(token)).send({
      ...enrollBody({ scheduleId: seed.individualScheduleId }),
      insuranceCode: "none",
    }).expect(200);
    assert.equal(first.body.data.waitlisted, false);
    const second = await agent.post("/api/enroll").set(auth(token)).send({
      ...enrollBody({
        scheduleId: seed.individualScheduleId,
        travelerName: "陈小川",
        travelerPhone: "13800138001",
        idCard: ID.femaleBj,
      }),
      couponCode: campaign.code,
      insuranceCode: "none",
    }).expect(200);
    assert.equal(second.body.data.waitlisted, true);
    assert.equal(second.body.data.quote.couponApplied, true);
    let uc = seed.db.prepare("SELECT * FROM user_coupons WHERE user_id=?").get(seed.userId);
    assert.equal(uc.status, "held");
    await agent.post(`/api/orders/${first.body.data.enrollmentId}/cancel`).set(auth(token)).expect(200);
    uc = seed.db.prepare("SELECT * FROM user_coupons WHERE user_id=?").get(seed.userId);
    assert.equal(uc.status, "used");
    await agent.post(`/api/orders/${second.body.data.enrollmentId}/cancel`).set(auth(token)).expect(200);
    uc = seed.db.prepare("SELECT * FROM user_coupons WHERE user_id=?").get(seed.userId);
    assert.equal(uc.status, "unused");
  });

  it("rejects company enroll with coupon and pauses new claims", async () => {
    const admin = await loginAdmin(agent);
    const created = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "amount",
      value: 20,
      total: 3,
    }).expect(200);
    await agent.put(`/api/admin/coupons/${created.body.data.id}`).set(auth(admin)).send({ status: "paused" }).expect(200);
    const token = await loginUser(agent);
    const claim = await agent.post(`/api/coupons/${created.body.data.code}/claim`).set(auth(token));
    assert.equal(claim.status, 400);
    const company = await loginCompany(agent);
    const bad = await agent.post("/api/enroll").set(auth(company)).send({
      ...enrollBody({
        scheduleId: seed.companyScheduleId,
        travelerName: "华创团建",
        travelerPhone: "13900139000",
        idCard: ID.maleHb,
      }),
      couponCode: created.body.data.code,
    });
    assert.equal(bad.status, 400);
  });

  it("lists unused coupons for the user", async () => {
    const { campaign } = await issueAmount(2, 40);
    const token = await loginUser(agent);
    await agent.post(`/api/coupons/${campaign.code}/claim`).set(auth(token)).expect(200);
    const mine = await agent.get("/api/me/coupons").set(auth(token)).expect(200);
    assert.equal(mine.body.data.length, 1);
    assert.equal(mine.body.data[0].status, "unused");
  });

  it("member-only campaign rejects non-members and directed needs grant", async () => {
    const admin = await loginAdmin(agent);
    const memberCamp = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "amount",
      value: 20,
      total: 5,
      audience: "member",
    }).expect(200);
    const cap = await issueCaptcha(agent);
    const guest = await agent.post("/api/auth/register").send({
      phone: "13600136021",
      password: "123456",
      nickname: "非会员",
      captchaToken: cap.token,
      captcha: cap.code,
    }).expect(200);
    const denied = await agent
      .post(`/api/coupons/${memberCamp.body.data.code}/claim`)
      .set(auth(guest.body.data.token));
    assert.equal(denied.status, 400);
    assert.match(denied.body.message, /会员/);
    const memberToken = await loginUser(agent);
    await agent.post(`/api/coupons/${memberCamp.body.data.code}/claim`).set(auth(memberToken)).expect(200);

    const directed = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "amount",
      value: 25,
      total: 5,
      audience: "directed",
      name: "定向券",
    }).expect(200);
    const self = await agent.post(`/api/coupons/${directed.body.data.code}/claim`).set(auth(memberToken));
    assert.equal(self.status, 400);
    const granted = await agent
      .post(`/api/admin/coupons/${directed.body.data.id}/grant`)
      .set(auth(admin))
      .send({ phones: ["13800138000"], sms: true })
      .expect(200);
    assert.equal(granted.body.data.granted, 1);
    assert.equal(granted.body.data.sms, 1);
    const sms = seed.db.prepare("SELECT * FROM sms_logs WHERE scene='coupon' AND phone=?").get("13800138000");
    assert.ok(sms);
    assert.match(sms.content, /\/c\/U/);
    const uc = seed.db.prepare("SELECT * FROM user_coupons WHERE user_id=? AND campaign_id=?").get(
      seed.userId,
      directed.body.data.id
    );
    const page = await agent.get(`/api/coupons/${uc.code}`).set(auth(memberToken)).expect(200);
    assert.equal(page.body.data.claimedByMe, true);
    const again = await agent
      .post(`/api/admin/coupons/${directed.body.data.id}/grant`)
      .set(auth(admin))
      .send({ phones: ["13800138000"], sms: true })
      .expect(200);
    assert.equal(again.body.data.granted, 0);
    assert.equal(again.body.data.skipped, 1);
  });
});
