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

  it("sets claim expiry and rejects after it lapses", async () => {
    const admin = await loginAdmin(agent);
    const created = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "amount",
      value: 40,
      total: 2,
      validHours: 24,
    }).expect(200);
    assert.equal(created.body.data.validHours, 24);
    const token = await loginUser(agent);
    const claimed = await agent.post(`/api/coupons/${created.body.data.code}/claim`).set(auth(token)).expect(200);
    assert.ok(claimed.body.data.myCoupon.expiresAt);
    const uc = seed.db.prepare("SELECT * FROM user_coupons WHERE user_id=?").get(seed.userId);
    seed.db.prepare("UPDATE user_coupons SET expires_at='2020-01-01 00:00:00' WHERE id=?").run(uc.id);
    const mine = await agent.get("/api/me/coupons").set(auth(token)).expect(200);
    assert.equal(mine.body.data[0].status, "expired");
    const enrolled = await agent.post("/api/enroll").set(auth(token)).send({
      ...enrollBody({ scheduleId: seed.individualScheduleId }),
      couponCode: uc.code,
      insuranceCode: "none",
    });
    assert.equal(enrolled.status, 400);
    assert.match(enrolled.body.message, /过期/);
  });

  it("lets a universal coupon apply on a personal trip but not a company tour", async () => {
    const admin = await loginAdmin(agent);
    const created = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      universal: true,
      kind: "amount",
      value: 50,
      total: 3,
      name: "通用满减",
    }).expect(200);
    assert.equal(created.body.data.universal, true);
    assert.equal(created.body.data.scheduleId, 0);
    const token = await loginUser(agent);
    const enrolled = await agent.post("/api/enroll").set(auth(token)).send({
      ...enrollBody({ scheduleId: seed.individualScheduleId }),
      couponCode: created.body.data.code,
      insuranceCode: "none",
    }).expect(200);
    assert.equal(enrolled.body.data.quote.couponApplied, true);
    assert.equal(enrolled.body.data.quote.payAmount, 149);
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

  it("stacks coupon on member price when asked", async () => {
    const admin = await loginAdmin(agent);
    const created = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "amount",
      value: 10,
      total: 2,
      stackMember: true,
    }).expect(200);
    assert.equal(created.body.data.stackMember, true);
    const token = await loginUser(agent);
    const enrolled = await agent.post("/api/enroll").set(auth(token)).send({
      ...enrollBody({ scheduleId: seed.individualScheduleId }),
      couponCode: created.body.data.code,
      insuranceCode: "none",
    }).expect(200);
    assert.equal(enrolled.body.data.quote.couponApplied, true);
    assert.equal(enrolled.body.data.quote.payAmount, 179);
  });

  it("filters claim by idle months and trip count", async () => {
    const admin = await loginAdmin(agent);
    seed.db.prepare(
      `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,pay_status,status)
       VALUES (?,?,?,?,?,?,?)`
    ).run(seed.individualScheduleId, seed.userId, "林北野", "13800138000", ID.maleBj, "paid", "joined");
    const idleCamp = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "amount",
      value: 20,
      total: 5,
      idleMonths: 2,
    }).expect(200);
    const token = await loginUser(agent);
    const recent = await agent.post(`/api/coupons/${idleCamp.body.data.code}/claim`).set(auth(token));
    assert.equal(recent.status, 400);
    assert.match(recent.body.message, /未参加/);

    const cap = await issueCaptcha(agent);
    const fresh = await agent.post("/api/auth/register").send({
      phone: "13600136031",
      password: "123456",
      nickname: "久未出门",
      captchaToken: cap.token,
      captcha: cap.code,
    }).expect(200);
    await agent.post(`/api/coupons/${idleCamp.body.data.code}/claim`).set(auth(fresh.body.data.token)).expect(200);

    const countCamp = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "amount",
      value: 15,
      total: 5,
      minTrips: 2,
    }).expect(200);
    const few = await agent.post(`/api/coupons/${countCamp.body.data.code}/claim`).set(auth(fresh.body.data.token));
    assert.equal(few.status, 400);
    seed.db.prepare(
      `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,pay_status,status)
       VALUES (?,?,?,?,?,?,?)`
    ).run(seed.companyScheduleId, fresh.body.data.user.id, "久未出门", "13600136031", ID.femaleSd, "paid", "joined");
    seed.db.prepare(
      `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,pay_status,status)
       VALUES (?,?,?,?,?,?,?)`
    ).run(seed.individualScheduleId, fresh.body.data.user.id, "久未出门", "13600136031", ID.femaleSd, "paid", "joined");
    await agent.post(`/api/coupons/${countCamp.body.data.code}/claim`).set(auth(fresh.body.data.token)).expect(200);
  });

  it("randomly grants when more people match than stock", async () => {
    const admin = await loginAdmin(agent);
    const cap = await issueCaptcha(agent);
    await agent.post("/api/auth/register").send({
      phone: "13600136041",
      password: "123456",
      nickname: "随机第三人",
      captchaToken: cap.token,
      captcha: cap.code,
    }).expect(200);
    const created = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      universal: true,
      kind: "amount",
      value: 20,
      total: 2,
      idleMonths: 2,
      audience: "directed",
      grantByRule: true,
      sms: false,
    }).expect(200);
    assert.equal(created.body.data.granted, 2);
    assert.equal(created.body.data.randomized, true);
    assert.ok(created.body.data.matched >= 2);
    const holders = seed.db.prepare("SELECT COUNT(*) AS c FROM user_coupons WHERE campaign_id=?").get(created.body.data.id);
    assert.equal(holders.c, 2);
  });

  it("issues a free coupon that zeros trip pay", async () => {
    const admin = await loginAdmin(agent);
    const created = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "free",
      total: 2,
      name: "免团费",
    }).expect(200);
    assert.equal(created.body.data.kind, "free");
    assert.equal(created.body.data.label, "免费");
    const token = await loginUser(agent);
    const enrolled = await agent.post("/api/enroll").set(auth(token)).send({
      ...enrollBody({ scheduleId: seed.individualScheduleId }),
      couponCode: created.body.data.code,
      insuranceCode: "none",
    }).expect(200);
    assert.equal(enrolled.body.data.quote.couponApplied, true);
    assert.equal(enrolled.body.data.quote.payAmount, 0);
    assert.equal(enrolled.body.data.payStatus, "paid");
    assert.match(enrolled.body.data.message, /团费已免/);
  });

  it("searches people and grants by user id", async () => {
    const admin = await loginAdmin(agent);
    const people = await agent.get("/api/admin/coupons/people?q=林北野").set(auth(admin)).expect(200);
    assert.ok(people.body.data.list.some((u) => u.id === seed.userId && u.isMember));
    assert.ok(people.body.data.total >= 1);
    assert.equal(people.body.data.page, 1);
    const created = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "amount",
      value: 15,
      total: 3,
      audience: "directed",
      name: "选人发放",
    }).expect(200);
    const granted = await agent
      .post(`/api/admin/coupons/${created.body.data.id}/grant`)
      .set(auth(admin))
      .send({ userIds: [seed.userId], sms: false })
      .expect(200);
    assert.equal(granted.body.data.granted, 1);
    const uc = seed.db.prepare("SELECT * FROM user_coupons WHERE user_id=? AND campaign_id=?").get(
      seed.userId,
      created.body.data.id
    );
    assert.ok(uc);
  });

  it("guarantees selected users on a member-only coupon", async () => {
    const admin = await loginAdmin(agent);
    const cap = await issueCaptcha(agent);
    const guest = await agent.post("/api/auth/register").send({
      phone: "13600136051",
      password: "123456",
      nickname: "必领非会员",
      captchaToken: cap.token,
      captcha: cap.code,
    }).expect(200);
    const guestId = guest.body.data.user.id;
    const created = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "amount",
      value: 20,
      total: 2,
      audience: "member",
      guaranteedUserIds: [guestId],
      name: "会员券必领",
    }).expect(200);
    assert.equal(created.body.data.granted, 1);
    assert.deepEqual(created.body.data.allowUserIds, [guestId]);
    assert.equal(created.body.data.remain, 1);
    const already = seed.db.prepare("SELECT * FROM user_coupons WHERE user_id=? AND campaign_id=?").get(
      guestId,
      created.body.data.id
    );
    assert.ok(already);

    const cap2 = await issueCaptcha(agent);
    const other = await agent.post("/api/auth/register").send({
      phone: "13600136052",
      password: "123456",
      nickname: "普通非会员",
      captchaToken: cap2.token,
      captcha: cap2.code,
    }).expect(200);
    const denied = await agent.post(`/api/coupons/${created.body.data.code}/claim`).set(auth(other.body.data.token));
    assert.equal(denied.status, 400);
    assert.match(denied.body.message, /会员/);

    const memberToken = await loginUser(agent);
    await agent.post(`/api/coupons/${created.body.data.code}/claim`).set(auth(memberToken)).expect(200);
    const sold = await agent.post(`/api/coupons/${created.body.data.code}/claim`).set(auth(other.body.data.token));
    assert.equal(sold.status, 400);
  });

  it("reserves a claim slot for allowlisted users even before grant", async () => {
    const admin = await loginAdmin(agent);
    const cap = await issueCaptcha(agent);
    const guest = await agent.post("/api/auth/register").send({
      phone: "13600136061",
      password: "123456",
      nickname: "预留领取",
      captchaToken: cap.token,
      captcha: cap.code,
    }).expect(200);
    const created = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "amount",
      value: 18,
      total: 1,
      audience: "member",
    }).expect(200);
    seed.db.prepare("INSERT INTO coupon_allowlist (campaign_id, user_id) VALUES (?,?)").run(
      created.body.data.id,
      guest.body.data.user.id
    );
    const memberToken = await loginUser(agent);
    const blocked = await agent.post(`/api/coupons/${created.body.data.code}/claim`).set(auth(memberToken));
    assert.equal(blocked.status, 400);
    await agent.post(`/api/coupons/${created.body.data.code}/claim`).set(auth(guest.body.data.token)).expect(200);
  });

  it("pages people search so large member lists can be browsed", async () => {
    const admin = await loginAdmin(agent);
    const cap = await issueCaptcha(agent);
    await agent.post("/api/auth/register").send({
      phone: "13600136071",
      password: "123456",
      nickname: "翻页甲",
      captchaToken: cap.token,
      captcha: cap.code,
    }).expect(200);
    const first = await agent.get("/api/admin/coupons/people?page=1&pageSize=1").set(auth(admin)).expect(200);
    assert.equal(first.body.data.list.length, 1);
    assert.equal(first.body.data.page, 1);
    assert.equal(first.body.data.pageSize, 1);
    assert.ok(first.body.data.total >= 3);
    const second = await agent.get("/api/admin/coupons/people?page=2&pageSize=1").set(auth(admin)).expect(200);
    assert.equal(second.body.data.list.length, 1);
    assert.notEqual(second.body.data.list[0].id, first.body.data.list[0].id);
    const members = await agent.get("/api/admin/coupons/people?members=1&q=翻页甲").set(auth(admin)).expect(200);
    assert.equal(members.body.data.total, 0);
    const named = await agent.get("/api/admin/coupons/people?q=翻页甲").set(auth(admin)).expect(200);
    assert.equal(named.body.data.total, 1);
    assert.equal(named.body.data.list[0].nickname, "翻页甲");
  });

  it("lets a public coupon designate people and still stay claimable", async () => {
    const admin = await loginAdmin(agent);
    const cap = await issueCaptcha(agent);
    const guest = await agent.post("/api/auth/register").send({
      phone: "13600136081",
      password: "123456",
      nickname: "公开必领",
      captchaToken: cap.token,
      captcha: cap.code,
    }).expect(200);
    const guestId = guest.body.data.user.id;
    const created = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "amount",
      value: 16,
      total: 2,
      audience: "public",
      guaranteedUserIds: [guestId],
      name: "公开指定",
    }).expect(200);
    assert.equal(created.body.data.granted, 1);
    assert.deepEqual(created.body.data.allowUserIds, [guestId]);
    assert.equal(created.body.data.remain, 1);
    const already = seed.db.prepare("SELECT * FROM user_coupons WHERE user_id=? AND campaign_id=?").get(
      guestId,
      created.body.data.id
    );
    assert.ok(already);
    const memberToken = await loginUser(agent);
    await agent.post(`/api/coupons/${created.body.data.code}/claim`).set(auth(memberToken)).expect(200);
    const cap2 = await issueCaptcha(agent);
    const other = await agent.post("/api/auth/register").send({
      phone: "13600136082",
      password: "123456",
      nickname: "公开领完",
      captchaToken: cap2.token,
      captcha: cap2.code,
    }).expect(200);
    const sold = await agent.post(`/api/coupons/${created.body.data.code}/claim`).set(auth(other.body.data.token));
    assert.equal(sold.status, 400);
    assert.match(sold.body.message, /领完/);
  });

  it("lists campus people by school and grants coupons to that roster", async () => {
    const admin = await loginAdmin(agent);
    const cap = await issueCaptcha(agent);
    const guest = await agent.post("/api/auth/register").send({
      phone: "13600136091",
      password: "123456",
      nickname: "北大甲",
      captchaToken: cap.token,
      captcha: cap.code,
    }).expect(200);
    const guestId = guest.body.data.user.id;
    await agent.post("/api/me/student").set(auth(guest.body.data.token)).send({ school: "北京大学" }).expect(200);
    await agent.post(`/api/admin/users/${guestId}/verify`).set(auth(admin)).send({ kind: "student", action: "approve" }).expect(200);

    const cap2 = await issueCaptcha(agent);
    const other = await agent.post("/api/auth/register").send({
      phone: "13600136092",
      password: "123456",
      nickname: "清华乙",
      captchaToken: cap2.token,
      captcha: cap2.code,
    }).expect(200);
    const otherId = other.body.data.user.id;
    await agent.post("/api/me/student").set(auth(other.body.data.token)).send({ school: "清华大学" }).expect(200);
    await agent.post(`/api/admin/users/${otherId}/verify`).set(auth(admin)).send({ kind: "student", action: "approve" }).expect(200);

    const people = await agent
      .get("/api/admin/coupons/people?campus=1&school=北京大学")
      .set(auth(admin))
      .expect(200);
    assert.ok(people.body.data.schools.some((s) => s.name === "北京大学"));
    assert.equal(people.body.data.list.length, 1);
    assert.equal(people.body.data.list[0].id, guestId);
    assert.equal(people.body.data.list[0].school, "北京大学");
    assert.equal(people.body.data.list[0].isStudent, true);

    const all = await agent
      .get("/api/admin/coupons/people?school=北京大学&campus=1&all=1")
      .set(auth(admin))
      .expect(200);
    assert.equal(all.body.data.total, 1);

    const created = await agent.post("/api/admin/coupons").set(auth(admin)).send({
      scheduleId: seed.individualScheduleId,
      kind: "amount",
      value: 12,
      total: 3,
      audience: "directed",
      school: "北京大学",
      allCampus: true,
      name: "北大定向",
    }).expect(200);
    assert.equal(created.body.data.granted, 1);
    const held = seed.db.prepare("SELECT * FROM user_coupons WHERE user_id=? AND campaign_id=?").get(
      guestId,
      created.body.data.id
    );
    assert.ok(held);
    const tsinghua = seed.db.prepare("SELECT * FROM user_coupons WHERE user_id=? AND campaign_id=?").get(
      otherId,
      created.body.data.id
    );
    assert.equal(tsinghua, undefined);
  });
});
