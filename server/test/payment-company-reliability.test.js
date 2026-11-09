// Keep this suite isolated even when a developer shell contains live credentials.
process.env.NODE_ENV = "test";
process.env.WX_PAY_MOCK = "1";
process.env.WX_APPSECRET = "wx_demo_secret";
for (const key of [
  "ALIYUN_ACCESS_KEY_ID", "ALIYUN_ACCESS_KEY_SECRET",
  "TENCENT_SECRET_ID", "TENCENT_SECRET_KEY", "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SIGN", "TENCENT_SMS_TEMPLATE_ID", "AI_API_KEY", "OPENAI_API_KEY",
  "WX_MCH_CERT_PATH", "WX_MCH_KEY_PATH", "WX_MCH_CERT_PASS",
]) process.env[key] = "";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, loginCompany, auth, ID, enrollPayload } = require("./http");
const config = require("../src/config");
const { refundEnrollmentToPayers, settleByTradeNo } = require("../src/services/payment");
const { scheduleRevenue } = require("../src/services/pay-ledger");
const { signMd5, objToXml, UNIFIED_ORDER_URL, ORDER_QUERY_URL } = require("../src/services/wechat");

describe("company payment reliability", () => {
  let agent;
  let seed;
  let originalFetch;
  let originalWechat;
  let externalAttempts;
  let gatewayCalls;

  beforeEach(() => {
    ({ agent, seed } = harness());
    originalWechat = { ...config.wechat };
    config.wechat.mock = true;
    config.wechat.appSecret = "wx_demo_secret";
    config.wechat.mchCertPath = "";
    config.wechat.mchKeyPath = "";
    originalFetch = global.fetch;
    externalAttempts = [];
    gatewayCalls = [];
    global.fetch = async (url) => {
      externalAttempts.push(String(url));
      throw new Error("External network disabled by company payment regression suite");
    };
  });

  afterEach(() => {
    seed.db.exec("DROP TRIGGER IF EXISTS qa_company_share_failure");
    global.fetch = originalFetch;
    Object.assign(config.wechat, originalWechat);
    assert.deepEqual(externalAttempts, [], "the suite must never attempt an unstubbed external call");
  });

  async function enrollCompany(count) {
    const traveler = await loginUser(agent);
    const company = await loginCompany(agent);
    const ids = [];
    for (let i = 0; i < count; i += 1) {
      const joined = await agent.post("/api/enroll").set(auth(traveler)).send(enrollPayload({
        scheduleId: seed.companyScheduleId,
        travelerName: ["公司成员甲", "公司成员乙", "公司成员丙"][i],
        travelerPhone: "13800138000",
        idCard: [ID.maleBj, ID.femaleBj, ID.maleHb][i],
      })).expect(200);
      assert.equal(joined.body.data.payStatus, "company_pending");
      ids.push(joined.body.data.enrollmentId);
    }
    return { traveler, company, ids };
  }

  function settlement(company) {
    return agent.post("/api/pay/company-settle").set(auth(company)).send({ scheduleId: seed.companyScheduleId });
  }

  function shares() {
    return seed.db.prepare("SELECT * FROM payments WHERE schedule_id=? AND scene='company_share' ORDER BY id")
      .all(seed.companyScheduleId);
  }

  function ledgerSnapshot() {
    return seed.db.prepare("SELECT * FROM payments WHERE schedule_id=? ORDER BY id").all(seed.companyScheduleId);
  }

  function assertSettled(ids, total) {
    const rows = shares();
    assert.equal(rows.length, ids.length);
    assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), total);
    assert.deepEqual(rows.map((row) => row.enrollment_id).sort((a, b) => a - b), [...ids].sort((a, b) => a - b));
    assert.ok(rows.every((row) => row.status === "success"));
    assert.ok(rows.every((row) => Number(row.user_id) === seed.companyUserId), "company is the actual payer of each share");
    assert.equal(scheduleRevenue(seed.companyScheduleId), total, "revenue counts company shares once, excluding the parent");
    const splitTotal = seed.db.prepare("SELECT IFNULL(SUM(amount),0) AS amount FROM payment_splits WHERE schedule_id=?")
      .get(seed.companyScheduleId).amount;
    assert.equal(splitTotal, total, "the split ledger must not count the parent charge again");
    const nonemptyTradeNos = ledgerSnapshot().map((row) => row.trade_no).filter(Boolean);
    assert.equal(new Set(nonemptyTradeNos).size, nonemptyTradeNos.length, "ledger trade numbers remain unique");
    for (const id of ids) {
      assert.equal(seed.db.prepare("SELECT pay_status FROM enrollments WHERE id=?").get(id).pay_status, "paid");
    }
  }

  function failShare(enrollmentId) {
    seed.db.exec(`CREATE TEMP TRIGGER qa_company_share_failure BEFORE INSERT ON payments
      WHEN NEW.scene='company_share' AND NEW.enrollment_id=${Number(enrollmentId)}
      BEGIN SELECT RAISE(ABORT, 'injected company share failure'); END`);
  }

  function enableProtocolMock() {
    // Pay uses the real signing/notification path; every remote gateway response is local.
    // A demo app secret disables unrelated virtual shipment HTTP requests.
    Object.assign(config.wechat, {
      mock: false,
      appId: "wx255ca387929c502a",
      appSecret: "wx_demo_secret",
      mchId: "1750196084",
      mchKey: "a".repeat(32),
    });
    seed.db.prepare("UPDATE users SET wechat_openid=? WHERE id=?").run("qa-company-openid", seed.companyUserId);
    global.fetch = async (url, opts) => {
      const href = String(url);
      if (href === UNIFIED_ORDER_URL) {
        gatewayCalls.push({ kind: "unified", body: String(opts?.body || "") });
        return { text: async () => objToXml({ return_code: "SUCCESS", result_code: "SUCCESS", prepay_id: "qa_company_prepay" }) };
      }
      if (href === ORDER_QUERY_URL) {
        gatewayCalls.push({ kind: "query", body: String(opts?.body || "") });
        return { text: async () => objToXml({
          return_code: "SUCCESS", result_code: "SUCCESS", trade_state: "SUCCESS", transaction_id: "qa-company-transaction",
        }) };
      }
      externalAttempts.push(href);
      throw new Error("External network disabled by company payment regression suite");
    };
  }

  function notify(tradeNo) {
    const fields = {
      return_code: "SUCCESS", result_code: "SUCCESS", mch_id: config.wechat.mchId,
      out_trade_no: tradeNo, transaction_id: "qa-company-transaction",
    };
    fields.sign = signMd5(fields, config.wechat.mchKey);
    return agent.post("/api/pay/wechat/notify").set("Content-Type", "text/xml").send(objToXml(fields));
  }

  for (const count of [1, 2, 3]) {
    it(`settles ${count} company traveler(s) in mock mode and rejects or safely reuses a repeated settlement`, async () => {
      const { company, ids } = await enrollCompany(count);
      const paid = await settlement(company).expect(200);
      assert.equal(paid.body.data.count, count);
      assert.equal(paid.body.data.needPay, false);
      assertSettled(ids, paid.body.data.total);
      const before = ledgerSnapshot();
      const repeated = await settlement(company);
      assert.ok([200, 400].includes(repeated.status));
      if (repeated.status === 400) assert.match(repeated.body.message, /没有待统一支付/);
      assert.deepEqual(ledgerSnapshot(), before, "repeated settlement creates no charges or shares");
    });
  }

  it("rolls back mock shares and booking changes when a later share fails, then permits retry", async () => {
    const { company, ids } = await enrollCompany(2);
    failShare(ids[1]);
    await settlement(company).expect(500);
    assert.equal(shares().length, 0, "the first share must roll back with the second");
    for (const id of ids) assert.equal(seed.db.prepare("SELECT pay_status FROM enrollments WHERE id=?").get(id).pay_status, "company_pending");
    assert.equal(ledgerSnapshot().filter((row) => row.status === "success").length, 0);
    seed.db.exec("DROP TRIGGER qa_company_share_failure");
    const retried = await settlement(company).expect(200);
    assertSettled(ids, retried.body.data.total);
  });

  it("settles a signed gateway notification once and refunds the original merchant order to the company payer", async () => {
    const { company, ids } = await enrollCompany(3);
    enableProtocolMock();
    const placed = await settlement(company).expect(200);
    assert.equal(placed.body.data.needPay, true);
    const { tradeNo, total } = placed.body.data;
    const accepted = await notify(tradeNo).expect(200);
    assert.match(accepted.text, /<return_code><!\[CDATA\[SUCCESS\]\]><\/return_code>/);
    assertSettled(ids, total);
    const parent = seed.db.prepare("SELECT * FROM payments WHERE trade_no=?").get(tradeNo);
    assert.equal(parent.status, "success");
    assert.equal(parent.scene, "company");
    assert.equal(parent.amount, total);
    const before = ledgerSnapshot();
    const duplicate = await notify(tradeNo).expect(200);
    assert.match(duplicate.text, /SUCCESS/);
    assert.deepEqual(ledgerSnapshot(), before);

    const refundCalls = [];
    const enrollment = seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(ids[0]);
    const refund = await refundEnrollmentToPayers(enrollment, {
      amount: enrollment.pay_amount,
      remark: "company regression refund",
      refundWechat: async (params) => { refundCalls.push(params); return {}; },
    });
    assert.equal(refundCalls.length, 1);
    assert.equal(refundCalls[0].tradeNo, tradeNo, "provider refund uses the actual company merchant order");
    assert.equal(refundCalls[0].transactionId, "qa-company-transaction");
    assert.equal(refundCalls[0].totalFen, Math.round(total * 100), "provider receives the full parent charge total");
    assert.equal(refundCalls[0].refundFen, Math.round(enrollment.pay_amount * 100));
    assert.equal(refund[0].userId, seed.companyUserId);
    const refundRow = seed.db.prepare("SELECT * FROM payments WHERE enrollment_id=? AND status='refunded'").get(ids[0]);
    const source = seed.db.prepare("SELECT * FROM payments WHERE id=?").get(refundRow.refund_of);
    assert.equal(refundRow.user_id, seed.companyUserId);
    assert.equal(source.enrollment_id, ids[0]);
    assert.equal(source.refunded_amount, enrollment.pay_amount);
    assert.equal(scheduleRevenue(seed.companyScheduleId), total - enrollment.pay_amount);
    const afterRefund = ledgerSnapshot();
    const lateDuplicate = await notify(tradeNo).expect(200);
    assert.match(lateDuplicate.text, /SUCCESS/);
    assert.deepEqual(ledgerSnapshot(), afterRefund, "a late notification must preserve an already refunded share");
    assert.equal(gatewayCalls.filter((call) => call.kind === "unified").length, 1);
  });

  it("keeps the parent unsettled when a signed notification cannot create every share, and retries atomically", async () => {
    const { company, ids } = await enrollCompany(2);
    enableProtocolMock();
    const placed = await settlement(company).expect(200);
    const { tradeNo, total } = placed.body.data;
    failShare(ids[1]);
    const failed = await notify(tradeNo).expect(200);
    assert.match(failed.text, /FAIL/);
    assert.notEqual(seed.db.prepare("SELECT status FROM payments WHERE trade_no=?").get(tradeNo).status, "success");
    assert.equal(shares().length, 0);
    for (const id of ids) assert.equal(seed.db.prepare("SELECT pay_status FROM enrollments WHERE id=?").get(id).pay_status, "company_pending");
    seed.db.exec("DROP TRIGGER qa_company_share_failure");
    const retry = await notify(tradeNo).expect(200);
    assert.match(retry.text, /SUCCESS/);
    assert.equal(seed.db.prepare("SELECT status FROM payments WHERE trade_no=?").get(tradeNo).status, "success");
    assertSettled(ids, total);
  });

  for (const recovery of ["notification", "confirmation"]) {
    it(`repairs a legacy successful parent with pending company bookings through ${recovery}`, async () => {
      const { company, ids } = await enrollCompany(2);
      enableProtocolMock();
      const placed = await settlement(company).expect(200);
      const { tradeNo, total } = placed.body.data;
      seed.db.prepare("UPDATE payments SET status='success',wechat_transaction_id=? WHERE trade_no=?")
        .run("qa-company-transaction", tradeNo);
      if (recovery === "notification") {
        const result = await notify(tradeNo).expect(200);
        assert.match(result.text, /SUCCESS/);
      } else {
        const result = await agent.post("/api/pay/confirm").set(auth(company)).send({ tradeNo }).expect(200);
        assert.equal(result.body.data.payStatus, "paid");
      }
      assertSettled(ids, total);
      assert.equal(gatewayCalls.filter((call) => call.kind === "query").length, 0, "a known paid parent needs no remote query");
    });
  }

  it("repairs a legacy successful company order before a repeated company-settle can issue another prepayment", async () => {
    const { company, ids } = await enrollCompany(2);
    enableProtocolMock();
    const placed = await settlement(company).expect(200);
    const { tradeNo, total } = placed.body.data;
    seed.db.prepare("UPDATE payments SET status='success',wechat_transaction_id=? WHERE trade_no=?")
      .run("qa-company-transaction", tradeNo);

    const retried = await settlement(company);
    assert.ok([200, 400].includes(retried.status));
    if (retried.status === 400) assert.match(retried.body.message, /没有待统一支付/);
    assertSettled(ids, total);
    const parents = ledgerSnapshot().filter((row) => row.scene === "company");
    assert.equal(parents.length, 1);
    assert.equal(parents[0].trade_no, tradeNo);
    assert.equal(gatewayCalls.filter((call) => call.kind === "unified").length, 1);
    assert.equal(gatewayCalls.filter((call) => call.kind === "query").length, 0);
  });

  it("rereads pending travelers after session lookup yields to another successful notification", async () => {
    const { company, ids } = await enrollCompany(2);
    enableProtocolMock();
    const placed = await settlement(company).expect(200);
    const { tradeNo, total } = placed.body.data;
    const gatewayFetch = global.fetch;
    let enteredSession;
    let releaseSession;
    const entered = new Promise((resolve) => { enteredSession = resolve; });
    const released = new Promise((resolve) => { releaseSession = resolve; });
    config.wechat.appSecret = "qa_session_lookup_secret";
    global.fetch = async (url, opts) => {
      if (new URL(String(url)).pathname === "/sns/jscode2session") {
        gatewayCalls.push({ kind: "session" });
        enteredSession();
        await released;
        return { json: async () => ({ openid: "qa-company-openid", session_key: "qa-session" }) };
      }
      return gatewayFetch(url, opts);
    };
    const inFlight = agent.post("/api/pay/company-settle").set(auth(company))
      .send({ scheduleId: seed.companyScheduleId, code: "qa-delayed-session" }).then((response) => response);
    let sessionTimer;
    try {
      await Promise.race([
        entered,
        new Promise((_, reject) => { sessionTimer = setTimeout(() => reject(new Error("session stub was not reached")), 2000); }),
      ]);
      clearTimeout(sessionTimer);
      config.wechat.appSecret = "wx_demo_secret";
      const notification = await notify(tradeNo).expect(200);
      assert.match(notification.text, /SUCCESS/);
      assertSettled(ids, total);
      const beforeResuming = ledgerSnapshot();
      releaseSession();
      const resumed = await inFlight;
      assert.ok([200, 400].includes(resumed.status));
      if (resumed.status === 400) assert.match(resumed.body.message, /没有待统一支付/);
      assert.deepEqual(ledgerSnapshot(), beforeResuming, "resuming settlement cannot create a second parent or share");
      assert.equal(gatewayCalls.filter((call) => call.kind === "session").length, 1);
      assert.equal(gatewayCalls.filter((call) => call.kind === "unified").length, 1);
    } finally {
      clearTimeout(sessionTimer);
      releaseSession();
      await inFlight;
    }
  });

  it("locally mocks a late company settlement after cancellation and returns only the unallocated parent amount once", async () => {
    const { traveler, ids } = await enrollCompany(2);
    const amountPerTraveler = 199;
    const total = amountPerTraveler * ids.length;
    const tradeNo = "QA-COMPANY-CANCEL-BEFORE-SETTLE";
    // Deliberately use a fully local mock for this race: no gateway refund or
    // merchant certificate is involved. The pending parent represents a
    // prepayment that was issued before the traveler cancelled.
    const parentId = Number(seed.db.prepare(`INSERT INTO payments
      (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene)
      VALUES (0,?,?,?,'wechat','pending',?,?,'company')`).run(
      seed.companyUserId, seed.companyScheduleId, total, tradeNo,
      JSON.stringify({ lines: ids.map((id) => ({ id, userId: seed.userId, amount: amountPerTraveler })) }),
    ).lastInsertRowid);
    await agent.post(`/api/orders/${ids[0]}/cancel`).set(auth(traveler)).send({}).expect(200);
    assert.equal(ledgerSnapshot().filter((row) => row.status === "refunded").length, 0, "cancelling an unpaid booking has nothing to refund yet");

    await settleByTradeNo(tradeNo, { transactionId: "qa-local-late-company-settlement" });
    const cancelled = seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(ids[0]);
    assert.equal(cancelled.status, "cancelled");
    assert.notEqual(cancelled.pay_status, "paid");
    assert.equal(seed.db.prepare("SELECT pay_status FROM enrollments WHERE id=?").get(ids[1]).pay_status, "paid");
    assert.equal(shares().length, 1);
    assert.equal(shares()[0].enrollment_id, ids[1]);
    assert.equal(shares()[0].amount, amountPerTraveler);
    assert.equal(shares()[0].user_id, seed.companyUserId);
    const parent = seed.db.prepare("SELECT * FROM payments WHERE id=?").get(parentId);
    assert.equal(parent.status, "success");
    assert.equal(parent.refunded_amount, amountPerTraveler);
    const refunds = ledgerSnapshot().filter((row) => row.status === "refunded");
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].refund_of, parentId, "unused money is refunded against the company parent");
    assert.equal(refunds[0].user_id, seed.companyUserId);
    assert.equal(refunds[0].amount, amountPerTraveler);
    assert.equal(shares()[0].amount + refunds[0].amount, total, "all received parent money is allocated or refunded");
    assert.equal(scheduleRevenue(seed.companyScheduleId), amountPerTraveler);
    const beforeDuplicate = ledgerSnapshot();
    await settleByTradeNo(tradeNo, { transactionId: "qa-local-late-company-settlement" });
    assert.deepEqual(ledgerSnapshot(), beforeDuplicate, "retrying the late settlement does not refund twice");
  });

  it("repairs only missing legacy shares without charging or duplicating a completed share", async () => {
    const { company, ids } = await enrollCompany(2);
    enableProtocolMock();
    const placed = await settlement(company).expect(200);
    const { tradeNo, total } = placed.body.data;
    await notify(tradeNo).expect(200);
    assertSettled(ids, total);
    const kept = shares().find((row) => row.enrollment_id === ids[0]);
    seed.db.prepare("DELETE FROM payments WHERE scene='company_share' AND enrollment_id=?").run(ids[1]);
    seed.db.prepare("UPDATE enrollments SET pay_status='company_pending' WHERE id=?").run(ids[1]);
    const repaired = await notify(tradeNo).expect(200);
    assert.match(repaired.text, /SUCCESS/);
    assertSettled(ids, total);
    assert.deepEqual(seed.db.prepare("SELECT * FROM payments WHERE id=?").get(kept.id), kept);
    assert.equal(gatewayCalls.filter((call) => call.kind === "unified").length, 1);
  });

  for (const refundedAmount of [0, 50, 199]) {
    it(`recovers an old paid company share with ${refundedAmount} yuan refunded without refunding its parent again`, async () => {
      const { company, ids } = await enrollCompany(1);
      await settlement(company).expect(200);
      const parent = ledgerSnapshot().find((row) => row.scene === "company");
      const share = shares()[0];
      // Historic startup deduplication renamed duplicate child trade numbers.
      // Such a row has neither a parent link nor a trustworthy merchant number.
      seed.db.prepare("UPDATE payments SET parent_payment_id=0,user_id=?,channel='wechat',trade_no=?,refunded_amount=? WHERE id=?")
        .run(seed.userId, `D${share.id}`, refundedAmount, share.id);
      if (refundedAmount) {
        seed.db.prepare(`INSERT INTO payments
          (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,scene,refund_of)
          VALUES (?,?,?,?,'wechat','refunded',?,'enrollment',?)`)
          .run(ids[0], seed.userId, seed.companyScheduleId, refundedAmount, `QA-OLD-REFUND-${share.id}`, share.id);
      }
      if (refundedAmount === share.amount) {
        seed.db.prepare("UPDATE enrollments SET status='cancelled',pay_status='refunded' WHERE id=?").run(ids[0]);
      }
      const beforeRefunds = ledgerSnapshot().filter((row) => row.status === "refunded");
      await agent.post("/api/pay/confirm").set(auth(company)).send({ tradeNo: parent.trade_no }).expect(200);
      const repaired = seed.db.prepare("SELECT * FROM payments WHERE id=?").get(share.id);
      assert.equal(repaired.parent_payment_id, parent.id);
      assert.equal(repaired.user_id, seed.companyUserId);
      assert.equal(repaired.refunded_amount, refundedAmount);
      assert.equal(seed.db.prepare("SELECT refunded_amount FROM payments WHERE id=?").get(parent.id).refunded_amount, 0);
      assert.deepEqual(ledgerSnapshot().filter((row) => row.status === "refunded"), beforeRefunds);
      const afterRecovery = ledgerSnapshot();
      await agent.post("/api/pay/confirm").set(auth(company)).send({ tradeNo: parent.trade_no }).expect(200);
      assert.deepEqual(ledgerSnapshot(), afterRecovery, "a duplicate confirmation cannot refund already allocated money");
    });
  }

  it("recovers an old company share before refund planning and refunds the company through the original parent order", async () => {
    const { company, ids } = await enrollCompany(2);
    await settlement(company).expect(200);
    const parent = ledgerSnapshot().find((row) => row.scene === "company");
    const share = shares()[0];
    seed.db.prepare("UPDATE payments SET parent_payment_id=0,user_id=?,channel='wechat',trade_no=? WHERE id=?")
      .run(seed.userId, `D${share.id}`, share.id);
    const calls = [];
    const enrollment = seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(ids[0]);
    const refunds = await refundEnrollmentToPayers(enrollment, {
      amount: share.amount,
      refundWechat: async (request) => { calls.push(request); },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tradeNo, parent.trade_no);
    assert.equal(calls[0].totalFen, parent.amount * 100);
    assert.equal(calls[0].refundFen, share.amount * 100);
    assert.equal(refunds[0].userId, seed.companyUserId);
    assert.equal(seed.db.prepare("SELECT parent_payment_id FROM payments WHERE id=?").get(share.id).parent_payment_id, parent.id);
  });

  it("stops automatic parent refunds when a historic company share could belong to more than one parent", async () => {
    const { company } = await enrollCompany(1);
    await settlement(company).expect(200);
    const parent = ledgerSnapshot().find((row) => row.scene === "company");
    const share = shares()[0];
    seed.db.prepare("UPDATE payments SET parent_payment_id=0,user_id=?,trade_no=? WHERE id=?")
      .run(seed.userId, `D${share.id}`, share.id);
    seed.db.prepare(`INSERT INTO payments
      (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene)
      VALUES (0,?,?,?,'wechat','success',?,?,'company')`)
      .run(parent.user_id, parent.schedule_id, parent.amount, "QA-AMBIGUOUS-COMPANY-PARENT", parent.remark);
    const before = ledgerSnapshot();
    await assert.rejects(settleByTradeNo(parent.trade_no), (error) => {
      assert.equal(error.status, 409);
      assert.match(error.message, /关联不明确/);
      return true;
    });
    assert.deepEqual(ledgerSnapshot(), before, "ambiguous legacy history must not trigger a gateway refund or rewrite payer records");
  });
});
