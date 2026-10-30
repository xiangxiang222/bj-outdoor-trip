const assert = require("node:assert/strict");
const { beforeEach, describe, it } = require("node:test");
const { harness, loginUser, loginCompany, issueCaptcha, auth, ID, enrollPayload } = require("./http");
const config = require("../src/config");

describe("意思意思: free arrangements and existing trip orders", () => {
  let agent;
  let seed;
  let keySequence;

  beforeEach(() => {
    ({ agent, seed } = harness());
    keySequence = 0;
  });

  function key(prefix = "wish") {
    return `${prefix}-request-${String(++keySequence).padStart(4, "0")}`;
  }

  function wishPayload(extra = {}) {
    return { idempotencyKey: key(), kind: "drink", title: "周末一起喝杯咖啡", recipientName: "朋友", note: "有空时一起坐坐", ...extra };
  }

  async function createWish(token, extra = {}) {
    const res = await agent.post("/api/wishes").set(auth(token)).send(wishPayload(extra)).expect(200);
    assert.ok(res.body.data.token);
    return res.body.data;
  }

  async function detail(wish, token) {
    const req = agent.get(`/api/wishes/${wish.token}`);
    const res = await (token ? req.set(auth(token)) : req).expect(200);
    return res.body.data;
  }

  async function enrollSelf(token) {
    token ||= await loginUser(agent);
    const res = await agent.post("/api/enroll").set(auth(token)).send(enrollPayload({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: ID.maleBj,
    })).expect(200);
    return { token, enrollmentId: res.body.data.enrollmentId, payShareToken: res.body.data.payShareToken };
  }

  async function registerFriend() {
    const cap = await issueCaptcha(agent);
    const res = await agent.post("/api/auth/register").send({
      phone: "13600136008", password: "123456", nickname: "同行好友", captchaToken: cap.token, captcha: cap.code,
    }).expect(200);
    return res.body.data.token;
  }

  function assertNoPrivateFields(value) {
    if (!value || typeof value !== "object") return;
    for (const [field, child] of Object.entries(value)) {
      assert.doesNotMatch(field, /^(?:userId|ownerId|claimantId|enrollmentId|scheduleId|phone|travelerPhone|emergencyPhone|idCard|realName|travelerName|payShareToken|pay_share_token)$/i, `private field: ${field}`);
      assertNoPrivateFields(child);
    }
  }

  it("publishes seven categories and requires an account for personal lists and creation", async () => {
    const meta = await agent.get("/api/wishes/meta").expect(200);
    const categories = meta.body.data.categories;
    assert.deepEqual(categories.map((item) => item.key).sort(), ["drink", "meal", "other", "outing", "show", "transport", "trip"]);
    for (const item of categories) {
      assert.ok(item.label && item.title && item.description);
    }
    await agent.get("/api/me/wishes").expect(401);
    await agent.get("/api/me/wish-orders").expect(401);
    await agent.post("/api/wishes").send(wishPayload()).expect(401);
    await agent.get("/api/wishes/unknown-token").expect(404);
  });

  it("keeps free wishes as arrangements without a price, checkout or payment record", async () => {
    const owner = await loginUser(agent);
    const friend = await loginCompany(agent);
    const wish = await createWish(owner);
    const shared = await detail(wish);
    assert.equal(shared.paymentMode, "claim");
    assert.equal(shared.order, null);
    assert.equal(shared.canPay, false);
    assert.equal(shared.canClaim, false);
    assert.equal((await detail(wish, friend)).canClaim, true);
    await agent.get(`/api/wishes/${wish.token}/payment`).expect(401);
    const denied = await agent.get(`/api/wishes/${wish.token}/payment`).set(auth(friend));
    assert.ok([400, 409].includes(denied.status));
    const inventedCheckout = await agent.post(`/api/wishes/${wish.token}/payment`).set(auth(friend)).send({ amount: 200, channel: "wallet" });
    assert.equal(inventedCheckout.status, 404);
    assert.equal(seed.db.prepare("SELECT COUNT(*) AS total FROM payments").get().total, 0);
    assert.equal(seed.db.prepare("SELECT COUNT(*) AS total FROM enrollments").get().total, 0);
  });

  it("returns the same wish for a retried creation and conflicts if the key changes meaning", async () => {
    const owner = await loginUser(agent);
    const body = wishPayload({ idempotencyKey: "same-create-request" });
    const first = await agent.post("/api/wishes").set(auth(owner)).send(body).expect(200);
    const replay = await agent.post("/api/wishes").set(auth(owner)).send(body).expect(200);
    assert.equal(replay.body.data.token, first.body.data.token);
    await agent.post("/api/wishes").set(auth(owner)).send({ ...body, title: "另一件事" }).expect(409);
    const list = await agent.get("/api/me/wishes?tab=created").set(auth(owner)).expect(200);
    assert.deepEqual(list.body.data.items.map((item) => item.token), [first.body.data.token]);
    const other = await loginCompany(agent);
    const separate = await agent.post("/api/wishes").set(auth(other)).send(body).expect(200);
    assert.notEqual(separate.body.data.token, first.body.data.token);
  });

  it("validates kinds and text limits instead of creating malformed shared pages", async () => {
    const owner = await loginUser(agent);
    for (const extra of [
      { kind: "money" }, { title: "   " }, { title: "愿".repeat(41) },
      { recipientName: "人".repeat(21) }, { note: "字".repeat(241) },
      { title: { text: "不是字符串" } }, { idempotencyKey: "" },
      { idempotencyKey: "short" }, { idempotencyKey: "has spaces in key" }, { idempotencyKey: "x".repeat(81) },
    ]) {
      await agent.post("/api/wishes").set(auth(owner)).send(wishPayload(extra)).expect(400);
    }
    const edge = await createWish(owner, { title: "愿".repeat(40), recipientName: "人".repeat(20), note: "字".repeat(240) });
    assert.equal(edge.title.length, 40);
    assert.equal(edge.note.length, 240);
  });

  it("paginates personal lists without dropping or duplicating wishes", async () => {
    const owner = await loginUser(agent);
    const created = [];
    for (const title of ["一杯咖啡", "一顿晚饭", "一次远行"]) created.push(await createWish(owner, { title }));
    const first = (await agent.get("/api/me/wishes?tab=created&limit=2").set(auth(owner)).expect(200)).body.data;
    assert.equal(first.items.length, 2);
    assert.equal(first.hasMore, true);
    assert.ok(first.nextCursor);
    const next = (await agent.get(`/api/me/wishes?tab=created&limit=2&cursor=${encodeURIComponent(first.nextCursor)}`).set(auth(owner)).expect(200)).body.data;
    assert.equal(next.items.length, 1);
    assert.equal(next.hasMore, false);
    const all = [...first.items, ...next.items].map((item) => item.token);
    assert.equal(new Set(all).size, 3);
    assert.deepEqual(all.sort(), created.map((item) => item.token).sort());
  });

  it("requires an account and a current revision for every claim action", async () => {
    const owner = await loginUser(agent);
    const friend = await loginCompany(agent);
    const wish = await createWish(owner);
    for (const action of ["claim", "complete", "close"]) {
      await agent.post(`/api/wishes/${wish.token}/${action}`).send({ revision: wish.revision }).expect(401);
    }
    await agent.delete(`/api/wishes/${wish.token}/claim`).send({ revision: wish.revision }).expect(401);
    await agent.post(`/api/wishes/${wish.token}/bless`).send({ message: "祝你开心", idempotencyKey: key() }).expect(401);
    await agent.post(`/api/wishes/${wish.token}/claim`).set(auth(friend)).send({}).expect(409);
    await agent.post(`/api/wishes/${wish.token}/claim`).set(auth(friend)).send({ revision: wish.revision - 1 }).expect(409);
    const claimed = await agent.post(`/api/wishes/${wish.token}/claim`).set(auth(friend)).send({ revision: wish.revision }).expect(200);
    assert.ok(claimed.body.data.revision > wish.revision);
    await agent.delete(`/api/wishes/${wish.token}/claim`).set(auth(friend)).send({ revision: wish.revision }).expect(409);
    assert.equal((await detail(wish, friend)).isClaimant, true);
  });

  it("does not let the creator claim their own wish or another person release or complete it", async () => {
    const owner = await loginUser(agent);
    const claimant = await loginCompany(agent);
    const third = await registerFriend();
    const wish = await createWish(owner);
    const self = await agent.post(`/api/wishes/${wish.token}/claim`).set(auth(owner)).send({ revision: wish.revision });
    assert.ok([400, 403, 409].includes(self.status));
    const claimed = (await agent.post(`/api/wishes/${wish.token}/claim`).set(auth(claimant)).send({ revision: wish.revision }).expect(200)).body.data;
    await agent.delete(`/api/wishes/${wish.token}/claim`).set(auth(third)).send({ revision: claimed.revision }).expect(403);
    await agent.post(`/api/wishes/${wish.token}/complete`).set(auth(owner)).send({ revision: claimed.revision }).expect(403);
    await agent.post(`/api/wishes/${wish.token}/close`).set(auth(third)).send({ revision: claimed.revision }).expect(403);
    const current = await detail(wish, claimant);
    assert.equal(current.status, "open");
    assert.equal(current.isClaimant, true);
  });

  it("allows only one successful claimant when two friends act on the same revision", async () => {
    const owner = await loginUser(agent);
    const first = await loginCompany(agent);
    const second = await registerFriend();
    const wish = await createWish(owner);
    const responses = await Promise.all([first, second].map((token) => agent.post(`/api/wishes/${wish.token}/claim`).set(auth(token)).send({ revision: wish.revision })));
    assert.deepEqual(responses.map((res) => res.status).sort(), [200, 409]);
    const firstView = await detail(wish, first);
    const secondView = await detail(wish, second);
    assert.equal(Number(firstView.isClaimant) + Number(secondView.isClaimant), 1);
  });

  it("reopens a released wish, retains participation history and completes only for its claimant", async () => {
    const owner = await loginUser(agent);
    const friend = await loginCompany(agent);
    const wish = await createWish(owner, { kind: "meal", title: "请朋友吃顿饭" });
    const claimed = (await agent.post(`/api/wishes/${wish.token}/claim`).set(auth(friend)).send({ revision: wish.revision }).expect(200)).body.data;
    const released = (await agent.delete(`/api/wishes/${wish.token}/claim`).set(auth(friend)).send({ revision: claimed.revision }).expect(200)).body.data;
    assert.equal(released.isClaimant, false);
    assert.equal((await detail(wish, friend)).canClaim, true);
    const history = await agent.get("/api/me/wishes?tab=joined").set(auth(friend)).expect(200);
    assert.deepEqual(history.body.data.items.map((item) => item.token), [wish.token]);
    const reclaimed = (await agent.post(`/api/wishes/${wish.token}/claim`).set(auth(friend)).send({ revision: released.revision }).expect(200)).body.data;
    const completed = (await agent.post(`/api/wishes/${wish.token}/complete`).set(auth(friend)).send({ revision: reclaimed.revision }).expect(200)).body.data;
    assert.equal(completed.status, "completed");
    assert.equal(completed.claimStatus, "completed");
    assert.equal(completed.canClaim, false);
    assert.equal(completed.canRelease, false);
    assert.equal(completed.canComplete, false);
    await agent.delete(`/api/wishes/${wish.token}/claim`).set(auth(friend)).send({ revision: completed.revision }).expect(409);
    await agent.post(`/api/wishes/${wish.token}/complete`).set(auth(friend)).send({ revision: completed.revision }).expect(409);
  });

  it("closes a wish only for its owner and prevents further claims and blessings", async () => {
    const owner = await loginUser(agent);
    const friend = await loginCompany(agent);
    const wish = await createWish(owner);
    const closed = (await agent.post(`/api/wishes/${wish.token}/close`).set(auth(owner)).send({ revision: wish.revision }).expect(200)).body.data;
    assert.equal(closed.status, "closed");
    assert.equal(closed.canBless, false);
    assert.equal(closed.canClaim, false);
    await agent.post(`/api/wishes/${wish.token}/claim`).set(auth(friend)).send({ revision: closed.revision }).expect(409);
    await agent.post(`/api/wishes/${wish.token}/bless`).set(auth(friend)).send({ idempotencyKey: key(), message: "现在不能再留言" }).expect(409);
    await agent.post(`/api/wishes/${wish.token}/close`).set(auth(owner)).send({ revision: closed.revision }).expect(409);
  });

  it("sends one free blessing per account with safe retry semantics and no duplicate joined rows", async () => {
    const owner = await loginUser(agent);
    const friend = await loginCompany(agent);
    const wish = await createWish(owner);
    const body = { idempotencyKey: "same-blessing", message: "一起开心出发！" };
    await agent.post(`/api/wishes/${wish.token}/bless`).set(auth(friend)).send(body).expect(200);
    await agent.post(`/api/wishes/${wish.token}/bless`).set(auth(friend)).send(body).expect(200);
    await agent.post(`/api/wishes/${wish.token}/bless`).set(auth(friend)).send({ ...body, message: "换了一句话" }).expect(409);
    await agent.post(`/api/wishes/${wish.token}/bless`).set(auth(friend)).send({ ...body, idempotencyKey: key() }).expect(409);
    const current = await detail(wish, friend);
    assert.equal(current.blessings.length, 1);
    assert.equal(current.blessings[0].message, body.message);
    assert.equal(current.blessings[0].self, true);
    assert.equal(current.canBless, false);
    await agent.post(`/api/wishes/${wish.token}/claim`).set(auth(friend)).send({ revision: current.revision }).expect(200);
    const joined = await agent.get("/api/me/wishes?tab=joined").set(auth(friend)).expect(200);
    assert.deepEqual(joined.body.data.items.map((item) => item.token), [wish.token]);
    assert.equal(seed.db.prepare("SELECT COUNT(*) AS total FROM payments").get().total, 0);
  });

  it("rejects blank, non-text and oversized blessings", async () => {
    const owner = await loginUser(agent);
    const friend = await loginCompany(agent);
    const wish = await createWish(owner);
    for (const message of ["   ", "祝".repeat(81), { text: "不可渲染的内容" }]) {
      await agent.post(`/api/wishes/${wish.token}/bless`).set(auth(friend)).send({ idempotencyKey: key(), message }).expect(400);
    }
    const limit = "祝".repeat(80);
    await agent.post(`/api/wishes/${wish.token}/bless`).set(auth(friend)).send({ idempotencyKey: key(), message: limit }).expect(200);
    assert.equal((await detail(wish)).blessings[0].message, limit);
  });

  it("checks user-authored wishes and blessings with the account's real WeChat identity", async () => {
    const owner = await loginUser(agent);
    const friend = await loginCompany(agent);
    const wish = await createWish(owner);
    seed.db.prepare("UPDATE users SET wechat_openid=? WHERE id=?").run("owner-live-openid", seed.userId);
    seed.db.prepare("UPDATE users SET wechat_openid=? WHERE id=?").run("friend-live-openid", seed.companyUserId);
    const previous = { appId: config.wechat.appId, appSecret: config.wechat.appSecret, fetch: global.fetch };
    const checks = [];
    config.wechat.appId = "wx-live-wishes-test";
    config.wechat.appSecret = "live-test-secret";
    global.fetch = async (url, options) => {
      if (String(url).includes("/cgi-bin/token?")) return { json: async () => ({ access_token: "wishes-security-test", expires_in: 7200 }) };
      assert.ok(String(url).includes("/wxa/msg_sec_check?"), "unexpected network request");
      checks.push(JSON.parse(options.body));
      return { json: async () => ({ errcode: 87014 }) };
    };
    try {
      await agent.post("/api/wishes").set(auth(owner)).send(wishPayload({ title: "命中内容检测的标题" })).expect(400);
      await agent.post(`/api/wishes/${wish.token}/bless`).set(auth(friend)).send({ idempotencyKey: key(), message: "命中内容检测的祝福" }).expect(400);
      assert.deepEqual(checks.map((check) => check.openid), ["owner-live-openid", "friend-live-openid"]);
      assert.equal((await detail(wish)).blessings.length, 0);
      const created = await agent.get("/api/me/wishes?tab=created").set(auth(owner)).expect(200);
      assert.equal(created.body.data.items.length, 1);
    } finally {
      config.wechat.appId = previous.appId;
      config.wechat.appSecret = previous.appSecret;
      global.fetch = previous.fetch;
    }
  });

  it("lists only the current account's eligible orders and never binds another person's booking", async () => {
    const booking = await enrollSelf();
    const other = await loginCompany(agent);
    const own = await agent.get("/api/me/wish-orders").set(auth(booking.token)).expect(200);
    assert.ok(own.body.data.items.some((item) => item.enrollmentId === booking.enrollmentId));
    const strangers = await agent.get("/api/me/wish-orders").set(auth(other)).expect(200);
    assert.equal(strangers.body.data.items.length, 0);
    await agent.post("/api/wishes").set(auth(other)).send(wishPayload({ kind: "trip", enrollmentId: booking.enrollmentId })).expect(403);
    await agent.post("/api/wishes").set(auth(booking.token)).send(wishPayload({ kind: "meal", enrollmentId: booking.enrollmentId })).expect(400);
    await agent.post("/api/wishes").set(auth(booking.token)).send(wishPayload({ kind: "trip", enrollmentId: -1 })).expect(400);
    await agent.post("/api/wishes").set(auth(booking.token)).send(wishPayload({ kind: "trip", enrollmentId: "not-an-order" })).expect(400);
    await agent.post("/api/wishes").set(auth(booking.token)).send(wishPayload({ kind: "trip", enrollmentId: 99999999 })).expect(404);
  });

  it("rejects cancelled, waiting, paid, past and unapproved orders at creation", async () => {
    const booking = await enrollSelf();
    const originalDate = seed.db.prepare("SELECT start_date FROM schedules WHERE id=?").get(seed.individualScheduleId).start_date;
    const cases = [
      ["UPDATE enrollments SET status='cancelled' WHERE id=?", booking.enrollmentId, "UPDATE enrollments SET status='joined' WHERE id=?"],
      ["UPDATE enrollments SET status='waitlist' WHERE id=?", booking.enrollmentId, "UPDATE enrollments SET status='joined' WHERE id=?"],
      ["UPDATE enrollments SET pay_status='paid' WHERE id=?", booking.enrollmentId, "UPDATE enrollments SET pay_status='unpaid' WHERE id=?"],
      ["UPDATE schedules SET start_date='2020-01-01' WHERE id=?", seed.individualScheduleId, `UPDATE schedules SET start_date='${originalDate}' WHERE id=?`],
      ["UPDATE schedules SET review_status='pending' WHERE id=?", seed.individualScheduleId, "UPDATE schedules SET review_status='approved' WHERE id=?"],
      ["UPDATE schedules SET status='cancelled' WHERE id=?", seed.individualScheduleId, "UPDATE schedules SET status='recruiting' WHERE id=?"],
      ["UPDATE schedules SET started_at='2026-01-01 08:00:00' WHERE id=?", seed.individualScheduleId, "UPDATE schedules SET started_at=NULL WHERE id=?"],
      ["UPDATE schedules SET completed_at='2026-01-01 20:00:00' WHERE id=?", seed.individualScheduleId, "UPDATE schedules SET completed_at=NULL WHERE id=?"],
    ];
    for (const [change, id, restore] of cases) {
      seed.db.prepare(change).run(id);
      const denied = await agent.post("/api/wishes").set(auth(booking.token)).send(wishPayload({ kind: "trip", enrollmentId: booking.enrollmentId }));
      assert.ok([400, 409].includes(denied.status), change);
      const candidates = await agent.get("/api/me/wish-orders").set(auth(booking.token)).expect(200);
      assert.ok(!candidates.body.data.items.some((item) => item.enrollmentId === booking.enrollmentId), change);
      seed.db.prepare(restore).run(id);
    }
  });

  it("binds an order permanently once and takes the recipient from the booking", async () => {
    const booking = await enrollSelf();
    const wish = await createWish(booking.token, { kind: "trip", enrollmentId: booking.enrollmentId, recipientName: "任意收款人" });
    assert.equal(wish.paymentMode, "enrollment");
    assert.ok(wish.order);
    assert.notEqual(wish.recipientName, "任意收款人");
    assert.equal(wish.canPay, true);
    const pay = await agent.get(`/api/wishes/${wish.token}/payment`).set(auth(booking.token)).expect(200);
    assert.deepEqual(pay.body.data, { token: booking.payShareToken, mode: "split" });
    await agent.post("/api/wishes").set(auth(booking.token)).send(wishPayload({ kind: "trip", enrollmentId: booking.enrollmentId })).expect(409);
    const closed = await agent.post(`/api/wishes/${wish.token}/close`).set(auth(booking.token)).send({ revision: wish.revision }).expect(200);
    assert.equal(closed.body.data.status, "closed");
    await agent.post("/api/wishes").set(auth(booking.token)).send(wishPayload({ kind: "trip", enrollmentId: booking.enrollmentId })).expect(409);
  });

  it("does not turn a linked order into a free arrangement or accept payment spoofing on claim", async () => {
    const booking = await enrollSelf();
    const friend = await loginCompany(agent);
    const wish = await createWish(booking.token, { kind: "trip", enrollmentId: booking.enrollmentId });
    const rejected = await agent.post(`/api/wishes/${wish.token}/claim`).set(auth(friend)).send({ revision: wish.revision });
    assert.ok([400, 409].includes(rejected.status));
    const free = await createWish(booking.token, { kind: "transport", title: "下次一起坐火车" });
    const spoofed = await agent.post(`/api/wishes/${free.token}/claim`).set(auth(friend)).send({ revision: free.revision, enrollmentId: booking.enrollmentId, amount: 500 });
    assert.ok([200, 400].includes(spoofed.status));
    const current = await detail(free, friend);
    assert.equal(current.order, null);
    assert.equal(current.paymentMode, "claim");
    assert.equal(current.canPay, false);
    const payment = await agent.get(`/api/wishes/${free.token}/payment`).set(auth(friend));
    assert.ok([400, 409].includes(payment.status));
    assert.equal(seed.db.prepare("SELECT COUNT(*) AS total FROM payments").get().total, 0);
  });

  it("shares masked names and progress without exposing personal records or the payment token", async () => {
    const booking = await enrollSelf();
    seed.db.prepare("UPDATE users SET nickname='山间来客' WHERE id=?").run(seed.userId);
    const wish = await createWish(booking.token, { kind: "trip", enrollmentId: booking.enrollmentId });
    const other = await loginCompany(agent);
    for (const token of [undefined, other]) {
      const shared = await detail(wish, token);
      assertNoPrivateFields(shared);
      const serialized = JSON.stringify(shared);
      for (const secret of ["13800138000", "13700000002", ID.maleBj, "林北野", booking.payShareToken]) {
        assert.ok(!serialized.includes(secret), `shared detail contains ${secret}`);
      }
      assert.ok(shared.ownerName);
      assert.equal(shared.isOwner, false);
    }
  });

  it("uses the original split-payment ledger and updates wish progress for each actual payer", async () => {
    const booking = await enrollSelf();
    const friend = await loginCompany(agent);
    const wish = await createWish(booking.token, { kind: "trip", enrollmentId: booking.enrollmentId });
    const pay = await agent.get(`/api/wishes/${wish.token}/payment`).set(auth(friend)).expect(200);
    assert.equal(pay.body.data.token, booking.payShareToken);
    const total = wish.order.payAmount;
    assert.ok(total > 1);
    const partial = await agent.post("/api/pay/for-enrollment").set(auth(friend)).send({ token: pay.body.data.token, amount: 1 }).expect(200);
    assert.equal(partial.body.data.remainAmount, total - 1);
    const current = await detail(wish, friend);
    assert.equal(current.order.paidAmount, 1);
    assert.equal(current.order.remainAmount, total - 1);
    const participant = await agent.get("/api/me/wishes?tab=joined").set(auth(friend)).expect(200);
    assert.deepEqual(participant.body.data.items.map((item) => item.token), [wish.token]);
    await agent.post("/api/pay/for-enrollment").set(auth(booking.token)).send({ token: pay.body.data.token, amount: total - 1 }).expect(200);
    const paid = await detail(wish, friend);
    assert.equal(paid.order.remainAmount, 0);
    assert.equal(paid.canPay, false);
    const unavailable = await agent.get(`/api/wishes/${wish.token}/payment`).set(auth(friend));
    assert.ok([400, 409].includes(unavailable.status));
    assert.equal(seed.db.prepare("SELECT COUNT(*) AS total FROM enrollments").get().total, 1);
    const ledger = seed.db.prepare("SELECT user_id,amount FROM payments WHERE enrollment_id=? AND status='success' ORDER BY amount").all(booking.enrollmentId);
    assert.equal(ledger.length, 2);
    assert.equal(ledger.reduce((sum, row) => sum + row.amount, 0), total);
    assert.equal(ledger.find((row) => row.amount === 1).user_id, seed.companyUserId);
  });

  it("accepts an already partly paid order and preserves its original remaining amount", async () => {
    const booking = await enrollSelf();
    await agent.post("/api/pay/for-enrollment").set(auth(booking.token)).send({ enrollmentId: booking.enrollmentId, amount: 1 }).expect(200);
    const wish = await createWish(booking.token, { kind: "trip", enrollmentId: booking.enrollmentId });
    assert.equal(wish.order.paidAmount, 1);
    assert.equal(wish.order.remainAmount, wish.order.payAmount - 1);
    assert.equal(wish.canPay, true);
  });

  it("closes only the invitation, preserving a partly paid booking and its original payment link", async () => {
    const booking = await enrollSelf();
    const friend = await loginCompany(agent);
    const wish = await createWish(booking.token, { kind: "trip", enrollmentId: booking.enrollmentId });
    await agent.post("/api/pay/for-enrollment").set(auth(friend)).send({ token: booking.payShareToken, amount: 1 }).expect(200);
    const before = seed.db.prepare("SELECT status,pay_status,pay_amount FROM enrollments WHERE id=?").get(booking.enrollmentId);
    const ledgerBefore = seed.db.prepare("SELECT * FROM payments WHERE enrollment_id=?").all(booking.enrollmentId);
    const current = await detail(wish, booking.token);
    const closed = (await agent.post(`/api/wishes/${wish.token}/close`).set(auth(booking.token)).send({ revision: current.revision }).expect(200)).body.data;
    assert.equal(closed.canPay, false);
    assert.deepEqual(seed.db.prepare("SELECT status,pay_status,pay_amount FROM enrollments WHERE id=?").get(booking.enrollmentId), before);
    assert.deepEqual(seed.db.prepare("SELECT * FROM payments WHERE enrollment_id=?").all(booking.enrollmentId), ledgerBefore);
    const unavailable = await agent.get(`/api/wishes/${wish.token}/payment`).set(auth(friend));
    assert.ok([400, 409].includes(unavailable.status));
    const original = await agent.get(`/api/pay/share/${booking.payShareToken}`).set(auth(friend)).expect(200);
    assert.equal(original.body.data.canPay, true);
    assert.equal(original.body.data.paidAmount, 1);
  });

  it("refunds a linked order to the original payers through the existing cancellation flow", async () => {
    const booking = await enrollSelf();
    const friend = await loginCompany(agent);
    const wish = await createWish(booking.token, { kind: "trip", enrollmentId: booking.enrollmentId });
    await agent.post("/api/pay/for-enrollment").set(auth(friend)).send({ token: booking.payShareToken, amount: 1 }).expect(200);
    await agent.post("/api/pay/for-enrollment").set(auth(booking.token)).send({ token: booking.payShareToken }).expect(200);
    const cancelled = await agent.post(`/api/orders/${booking.enrollmentId}/cancel`).set(auth(booking.token)).expect(200);
    assert.equal(cancelled.body.data.payStatus, "refunded");
    assert.deepEqual(cancelled.body.data.refunds.map((row) => Number(row.userId)).sort(), [seed.userId, seed.companyUserId].sort());
    const friendRefund = cancelled.body.data.refunds.find((row) => Number(row.userId) === seed.companyUserId);
    assert.equal(friendRefund.amount, 1);
    const current = await detail(wish, friend);
    assert.equal(current.canPay, false);
    const unavailable = await agent.get(`/api/wishes/${wish.token}/payment`).set(auth(friend));
    assert.ok([400, 409].includes(unavailable.status));
  });

  it("rechecks the actual booking when opening payment after the invitation was created", async () => {
    const booking = await enrollSelf();
    const friend = await loginCompany(agent);
    const wish = await createWish(booking.token, { kind: "trip", enrollmentId: booking.enrollmentId });
    seed.db.prepare("UPDATE schedules SET start_date='2020-01-01' WHERE id=?").run(seed.individualScheduleId);
    assert.equal((await detail(wish, friend)).canPay, false);
    const past = await agent.get(`/api/wishes/${wish.token}/payment`).set(auth(friend));
    assert.ok([400, 409].includes(past.status));
    seed.db.prepare("UPDATE schedules SET start_date='2099-01-01',review_status='rejected' WHERE id=?").run(seed.individualScheduleId);
    const rejected = await agent.get(`/api/wishes/${wish.token}/payment`).set(auth(friend));
    assert.ok([400, 409].includes(rejected.status));
  });

  it("isolates created and joined lists between accounts and rejects stale deleted-account sessions", async () => {
    const owner = await loginUser(agent);
    const friend = await loginCompany(agent);
    const wish = await createWish(owner);
    const otherWish = await createWish(friend, { kind: "show", title: "下次一起看演出" });
    const created = await agent.get("/api/me/wishes?tab=created").set(auth(owner)).expect(200);
    assert.deepEqual(created.body.data.items.map((item) => item.token), [wish.token]);
    const strangerCreated = await agent.get("/api/me/wishes?tab=created").set(auth(friend)).expect(200);
    assert.deepEqual(strangerCreated.body.data.items.map((item) => item.token), [otherWish.token]);
    const notJoined = await agent.get("/api/me/wishes?tab=joined").set(auth(friend)).expect(200);
    assert.equal(notJoined.body.data.items.length, 0);
    await agent.delete("/api/me").set(auth(owner)).expect(200);
    await agent.get("/api/me/wishes").set(auth(owner)).expect(401);
    await agent.post("/api/wishes").set(auth(owner)).send(wishPayload()).expect(401);
    const old = await agent.get(`/api/wishes/${wish.token}`);
    assert.ok([404, 410].includes(old.status));
    const cap = await issueCaptcha(agent);
    const replacement = await agent.post("/api/auth/register").send({ phone: "13800138000", password: "123456", nickname: "新账号", captchaToken: cap.token, captcha: cap.code }).expect(200);
    const empty = await agent.get("/api/me/wishes?tab=created").set(auth(replacement.body.data.token)).expect(200);
    assert.equal(empty.body.data.items.length, 0);
  });

  it("releases unfinished arrangements if their claimant deletes the account", async () => {
    const owner = await loginUser(agent);
    const friend = await loginCompany(agent);
    const replacement = await registerFriend();
    const wish = await createWish(owner);
    const claimed = (await agent.post(`/api/wishes/${wish.token}/claim`).set(auth(friend)).send({ revision: wish.revision }).expect(200)).body.data;
    await agent.delete("/api/me").set(auth(friend)).expect(200);
    await agent.delete(`/api/wishes/${wish.token}/claim`).set(auth(friend)).send({ revision: claimed.revision }).expect(401);
    const current = await detail(wish, replacement);
    assert.equal(current.canClaim, true);
    assert.equal(current.claimStatus, null);
    assert.ok(current.revision > claimed.revision);
    const reassigned = await agent.post(`/api/wishes/${wish.token}/claim`).set(auth(replacement)).send({ revision: current.revision }).expect(200);
    assert.equal(reassigned.body.data.isClaimant, true);
  });
  it("delivers claim and blessing notices once, with the correct wish return link", async () => {
    const owner = await loginUser(agent), friend = await loginCompany(agent);
    const wish = await createWish(owner);
    await agent.post(`/api/wishes/${wish.token}/claim`).set(auth(friend)).send({revision:wish.revision}).expect(200);
    const request = {message:"周末见",idempotencyKey:"notice-blessing-001"};
    await agent.post(`/api/wishes/${wish.token}/bless`).set(auth(friend)).send(request).expect(200);
    await agent.post(`/api/wishes/${wish.token}/bless`).set(auth(friend)).send(request).expect(200);
    const notices = seed.db.prepare("SELECT href,kind FROM user_notices WHERE user_id=? AND ref_type='wish' ORDER BY kind").all(seed.userId);
    assert.deepEqual(notices,[{href:`/m/wishes/${wish.token}`,kind:"wish_bless"},{href:`/m/wishes/${wish.token}`,kind:"wish_claim"}]);
  });

  it("returns an existing wish only on the owner's order detail, including a closed invitation", async () => {
    const {token:owner,enrollmentId} = await enrollSelf();
    const friend = await loginCompany(agent);
    const wish = await createWish(owner,{kind:"trip",enrollmentId});
    await agent.post(`/api/wishes/${wish.token}/close`).set(auth(owner)).send({revision:wish.revision}).expect(200);
    const detail = await agent.get(`/api/orders/${enrollmentId}`).set(auth(owner)).expect(200);
    assert.equal(detail.body.data.wishToken,wish.token);
    assert.equal(detail.body.data.canLinkWish,false);
    await agent.get(`/api/orders/${enrollmentId}`).set(auth(friend)).expect(404);
  });

  it("hides the wish entry when an unpaid booking can no longer be linked", async () => {
    const booking = await enrollSelf();
    const open = await agent.get(`/api/orders/${booking.enrollmentId}`).set(auth(booking.token)).expect(200);
    assert.equal(open.body.data.canPay, true);
    assert.equal(open.body.data.canLinkWish, true);
    const originalDate = seed.db.prepare("SELECT start_date FROM schedules WHERE id=?").get(seed.individualScheduleId).start_date;
    const cases = [
      ["UPDATE schedules SET start_date='2020-01-01' WHERE id=?", `UPDATE schedules SET start_date='${originalDate}' WHERE id=?`],
      ["UPDATE schedules SET review_status='pending' WHERE id=?", "UPDATE schedules SET review_status='approved' WHERE id=?"],
      ["UPDATE schedules SET status='cancelled' WHERE id=?", "UPDATE schedules SET status='recruiting' WHERE id=?"],
      ["UPDATE schedules SET started_at='2026-01-01 08:00:00' WHERE id=?", "UPDATE schedules SET started_at=NULL WHERE id=?"],
      ["UPDATE schedules SET completed_at='2026-01-01 20:00:00' WHERE id=?", "UPDATE schedules SET completed_at=NULL WHERE id=?"],
    ];
    for (const [change, restore] of cases) {
      seed.db.prepare(change).run(seed.individualScheduleId);
      const row = await agent.get(`/api/orders/${booking.enrollmentId}`).set(auth(booking.token)).expect(200);
      assert.equal(row.body.data.canPay, true, change);
      assert.equal(row.body.data.canLinkWish, false, change);
      assert.equal(row.body.data.wishToken, null, change);
      seed.db.prepare(restore).run(seed.individualScheduleId);
    }
  });

});
