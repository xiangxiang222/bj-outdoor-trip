#!/usr/bin/env node
// An offline business journey through a real loopback HTTP server and a retained,
// isolated SQLite database. No developer or production data is opened.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const output = process.env.QA_ARTIFACT_DIR
  ? path.resolve(process.env.QA_ARTIFACT_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), "bj-trip-lifecycle-"));
fs.mkdirSync(output, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(output, "data-"));
Object.assign(process.env, {
  NODE_ENV: "test", WX_PAY_MOCK: "1", WX_APPSECRET: "wx_demo_secret",
  WX_MCH_KEY: "", WX_MCH_CERT_PATH: "", WX_MCH_KEY_PATH: "",
  ALIYUN_ACCESS_KEY_ID: "", ALIYUN_ACCESS_KEY_SECRET: "",
  TENCENT_SECRET_ID: "", TENCENT_SECRET_KEY: "", TENCENT_SMS_SDK_APP_ID: "",
  TENCENT_SMS_SIGN: "", TENCENT_SMS_TEMPLATE_ID: "",
  AI_API_KEY: "", OPENAI_API_KEY: "", ROUTE_I18N_AUTO: "0",
  AI_DISCOVERY_DAILY_LIMIT: "0", MMC_DATA_DIR: dataDir,
  MMC_DB_FILE: path.join(dataDir, "app.sqlite"),
  MMC_PUBLIC_DIR: path.join(dataDir, "public"), MMC_SKIP_WEB: "1", PORT: "0",
});

const nativeFetch = global.fetch;
const attemptedExternalRequests = [];
global.fetch = async (url, options) => {
  const parsed = new URL(String(url));
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    attemptedExternalRequests.push(parsed.origin + parsed.pathname);
    throw new Error("QA forbids external network: " + parsed.origin);
  }
  return nativeFetch(url, options);
};
const { createApp } = require("../server/src/app");
const { seedMinimal } = require("../server/test/helpers");
const config = require("../server/src/config");
const { getDb } = require("../server/src/db");
const sharp = require(require.resolve("sharp", { paths: [path.join(root, "server")] }));
const seed = seedMinimal();
const db = getDb();
// Keep the infrastructure fixture only. Every business user below is registered
// through /auth/register; no seeded user or seeded trip is used in a journey.
db.exec("DELETE FROM schedules; DELETE FROM users;");

const report = {
  task: "大众 / 高校 / 公司发团、报名、成团与导游全流程",
  startedAt: new Date().toISOString(), referenceDate: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
  environment: { database: config.dbFile, publicDir: config.publicDir, host: "127.0.0.1", payment: "WX_PAY_MOCK=1", identity: "demo identity provider", sms: "demo 888888", externalNetwork: "blocked" },
  boundaries: ["No WeChat/iPhone native UI or real payment/refund provider is exercised.", "Captcha text is read from the isolated DB to automate the image challenge.", "To cross the departure-date boundary, only the isolated schedules' dates are moved to Beijing today; all start/check-in/complete transitions use HTTP APIs.", "Corporate verification uses the existing group certification API; no separate business-license verification endpoint exists."],
  cases: [], accounts: [], trips: [], fixtures: [],
};
const apiTrace = [];
let origin;
let adminToken;
let guideToken;
let server;
let serial = 0;
const password = "QaTrip2026!";
const chinaDate = (days = 0) => new Date(Date.now() + (8 + days * 24) * 3600000).toISOString().slice(0, 10);

async function request(method, pathname, { token, body, expected = 200 } = {}) {
  const response = await nativeFetch(origin + "/api" + pathname, {
    method, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  apiTrace.push({ seq: ++serial, method, path: pathname, status: response.status, expected, ok: payload.ok, message: payload.message || "" });
  assert.equal(response.status, expected, `${method} ${pathname}: ${payload.message || JSON.stringify(payload)}`);
  if (expected < 400) assert.notEqual(payload.ok, false, pathname);
  return payload.data === undefined ? payload : payload.data;
}
async function step(name, action, dependencies = []) {
  const failedDependency = dependencies.some((item) => !Boolean(item));
  const entry = { name, status: "running", startSeq: serial + 1 };
  report.cases.push(entry);
  if (failedDependency) {
    entry.status = "blocked"; entry.reason = "A prerequisite case failed";
    console.log("BLOCKED " + name); return false;
  }
  const started = Date.now();
  try {
    const evidence = await action();
    entry.status = "pass"; if (evidence !== undefined) entry.evidence = evidence;
    console.log("PASS " + name);
    return true;
  } catch (error) {
    entry.status = "fail"; entry.error = error.message;
    console.log("FAIL " + name + ": " + error.message);
    return false;
  } finally { entry.ms = Date.now() - started; entry.endSeq = serial; }
}

function publicReplacer(key, value) {
  if (/password|token|idcard|jwt|authorization/i.test(key)) return undefined;
  if (typeof value !== "string") return value;
  return value
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED JWT]")
    .replace(/\b\d{17}[\dXx]\b/g, "[REDACTED ID]")
    .replace(/("(?:password|\w*token|idcard|jwt|authorization)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"');
}
async function captcha() {
  const data = await request("GET", "/auth/captcha");
  return { captchaToken: data.token, captcha: db.prepare("SELECT code FROM captchas WHERE token=?").get(data.token).code };
}
function syntheticCard(index) {
  const prefix = "110101199001" + String(index + 1).padStart(2, "0") + String(100 + index);
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const sum = [...prefix].reduce((total, char, i) => total + Number(char) * weights[i], 0);
  return prefix + "10X98765432"[sum % 11];
}
function enrollBody(user, trip, extra = {}) {
  return { scheduleId: trip.id, travelerName: user.nickname, travelerPhone: user.phone,
    idCard: user.idCard, emergencyName: "隔离测试紧急联系人", emergencyPhone: "19999999999",
    waiverAccepted: true, healthOk: true, insuranceCode: "none", ...extra };
}
async function upload(user, filename) {
  const image = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#306950" } }).png().toBuffer();
  const form = new FormData(); form.append("file", new Blob([image], { type: "image/png" }), filename);
  const response = await nativeFetch(origin + "/api/upload", { method: "POST", headers: { Authorization: "Bearer " + user.token }, body: form });
  const payload = await response.json();
  apiTrace.push({ seq: ++serial, method: "POST", path: "/upload", status: response.status, expected: 200 });
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload.data.url;
}
async function certifyStudent(user, school = "北京大学") {
  const studentCardUrl = await upload(user, "qa-student-card.png");
  const submitted = await request("POST", "/me/student", { token: user.token, body: { school, college: "信息科学技术学院", major: "计算机科学与技术", studentNo: "20260000" + user.id, studentCardUrl } });
  assert.equal(submitted.studentStatus, "pending");
  const approved = await request("POST", `/admin/users/${user.id}/verify`, { token: adminToken, body: { kind: "student", revision: submitted.studentRevision, action: "approve" } });
  assert.equal(approved.studentStatus, "approved");
  user.school = school;
}
async function pay(user, enrollmentId, amount) {
  const charged = await request("POST", "/pay/for-enrollment", { token: user.token, body: { enrollmentId, ...(amount == null ? {} : { amount }) } });
  assert.equal(charged.mock, true);
  return charged;
}

async function run() {
  server = await new Promise((resolve) => { const listener = createApp().listen(0, "127.0.0.1", () => resolve(listener)); });
  origin = "http://127.0.0.1:" + server.address().port;
  report.environment.origin = origin;
  await step("环境：支付/短信/实名 mock 且数据库在隔离目录", async () => {
    const meta = await request("GET", "/meta");
    assert.equal(meta.wechatPayMock, true); assert.equal(meta.wechatPayLive, false); assert.equal(meta.smsLive, false);
    assert.equal(config.aliyun.accessKeyId, ""); assert.equal(config.ai.apiKey, "");
    assert.ok(config.dbFile.startsWith(dataDir + path.sep));
    return { wechatPayMock: true, smsLive: false, database: config.dbFile };
  });
  await step("后台：管理员真实密码登录", async () => { adminToken = (await request("POST", "/admin/login", { body: { username: "admin", password: "admin123" } })).token; assert.ok(adminToken); });
  const names = ["大众发起人", "高校发起人", "公司发起人", "大众报名甲", "大众报名乙", "大众报名丙", "高校报名甲", "高校报名乙", "高校报名丙", "公司员工甲", "公司员工乙", "公司员工丙", "普通旁观者", "外校学生"];
  for (const [index, nickname] of names.entries()) {
    await step(`账号：注册并实名 ${nickname}`, async () => {
      const phone = "1990001" + String(index).padStart(4, "0");
      const data = await request("POST", "/auth/register", { body: { phone, password, nickname, ...await captcha() } });
      const user = { id: data.user.id, phone, nickname, password, token: data.token, idCard: syntheticCard(index) };
      report.accounts.push(user);
      const verified = await request("POST", "/me/realname", { token: user.token, body: { realName: nickname, idCard: user.idCard, code: "qa-demo" } });
      assert.equal(verified.realName, nickname);
      assert.equal(db.prepare("SELECT id_verified FROM users WHERE id=?").get(user.id).id_verified, 1);
      const logged = await request("POST", "/auth/login", { body: { phone, password, ...await captcha() } });
      assert.equal(logged.user.id, user.id);
      return { id: user.id, phone, idVerified: true };
    });
  }
  const users = report.accounts;
  assert.equal(users.length, 14, "Account fixture incomplete; refusing misleading downstream results");
  await step("账号边界：无验证码、错误密码、重复注册均拒绝", async () => {
    await request("POST", "/auth/login", { body: { phone: users[0].phone, password }, expected: 400 });
    await request("POST", "/auth/login", { body: { phone: users[0].phone, password: "wrong-password", ...await captcha() }, expected: 400 });
    await request("POST", "/auth/register", { body: { phone: users[0].phone, password, ...await captcha() }, expected: 400 });
  });
  for (const index of [1, 6, 7, 8, 13]) await step(`校园认证：${users[index].nickname} 申请、上传凭证、后台通过`, () => certifyStudent(users[index], index === 13 ? "清华大学" : "北京大学"));
  await step("公司发起人团体资料：申请、后台审核通过、公司名称维护", async () => {
    const submitted = await request("POST", "/me/group", { token: users[2].token, body: { name: "隔离测试科技有限公司", kind: "企业" } });
    assert.equal(submitted.groupStatus, "pending");
    await request("POST", `/admin/users/${users[2].id}/verify`, { token: adminToken, body: { kind: "group", action: "approve" } });
    const user = await request("PUT", "/me", { token: users[2].token, body: { companyName: "隔离测试科技有限公司" } });
    assert.equal(user.groupStatus, "approved");
  });
  const definitions = [
    { key: "public", label: "大众团", type: "individual", organizer: users[0], people: users.slice(3, 6), price: 99 },
    { key: "campus", label: "高校团", type: "campus", organizer: users[1], people: users.slice(6, 9), price: 100 },
    { key: "company", label: "公司团", type: "company", organizer: users[2], people: users.slice(9, 12), price: 120 },
  ];
  for (const [index, def] of definitions.entries()) {
    const created = await step(`${def.label}：发团提交审核，未审时不能报名`, async () => {
      const cover = await upload(def.organizer, "qa-cover.png");
      const trip = await request("POST", "/trips", { token: def.organizer.token, body: {
        title: `QA全流程-${def.label}`, organizerType: def.type, companyName: def.type === "company" ? "隔离测试科技有限公司" : def.type === "campus" ? "北京大学" : "",
        startDate: chinaDate(8 + index), days: 1, busTypeId: "coaster10", minGroupSize: 3,
        originPrice: def.price, offerType: "full", cover, heatMode: "off", oversub: false,
        meetupPoint: "东直门东方银座C口", meetupTime: "07:30", city: "北京", category: "长城",
        itinerary: [{ time: "07:30", title: "集合出发" }, { time: "12:00", title: "休息点集合" }],
        description: "隔离环境全流程测试。", ...(def.type === "campus" ? { studentOnly: true, schools: ["北京大学"], studentPriceOn: true } : {}),
      } });
      def.trip = { id: trip.id, key: def.key, label: def.label, type: trip.organizerType, routeId: trip.route.id, enrollments: [] };
      report.trips.push(def.trip);
      assert.equal(trip.reviewStatus, "pending"); assert.equal(trip.organizerType, def.type);
      await request("POST", "/enroll", { token: def.people[0].token, body: enrollBody(def.people[0], def.trip), expected: 400 });
      return { id: trip.id, organizerType: trip.organizerType, reviewStatus: trip.reviewStatus };
    });
    def.ready = created && await step(`${def.label}：后台审批，公开详情和发起人消息可见`, async () => {
      const approved = await request("POST", `/admin/schedules/${def.trip.id}/review`, { token: adminToken, body: { status: "approved" } });
      assert.equal(approved.reviewStatus, "approved");
      const detail = await request("GET", `/schedules/${def.trip.id}`);
      assert.equal(detail.reviewStatus, "approved");
      const notices = await request("GET", "/me/notices", { token: def.organizer.token });
      assert.ok(JSON.stringify(notices).includes("发团已通过"));
      return { scheduleId: def.trip.id, title: detail.route.title };
    });
  }
  const campus = definitions[1];
  if (campus.trip) await step("高校资格：未认证和外校学生均不能报名", async () => {
    for (const user of [users[12], users[13]]) await request("POST", "/enroll", { token: user.token, body: enrollBody(user, campus.trip), expected: 400 });
  });
  for (const def of definitions) {
    if (!def.trip) continue;
    for (const [index, user] of def.people.entries()) await step(`${def.label}：${user.nickname} 报名、订单、${def.type === "company" ? "企业挂账" : "mock支付"}`, async () => {
      const joined = await request("POST", "/enroll", { token: user.token, body: enrollBody(user, def.trip) });
      assert.equal(joined.status, "joined"); assert.ok(joined.seatNo);
      def.trip.enrollments.push({ id: joined.enrollmentId, userId: user.id, phone: user.phone });
      await request("POST", "/enroll", { token: user.token, body: enrollBody(user, def.trip), expected: 400 });
      if (def.type === "company") assert.equal(joined.payStatus, "company_pending");
      else {
        assert.equal(joined.payStatus, "unpaid");
        const charged = await pay(user, joined.enrollmentId);
        assert.equal(charged.payStatus, "paid");
        await request("POST", "/pay/for-enrollment", { token: user.token, body: { enrollmentId: joined.enrollmentId }, expected: 400 });
      }
      const order = await request("GET", `/orders/${joined.enrollmentId}`, { token: user.token });
      assert.equal(order.pay_status, def.type === "company" ? "company_pending" : "paid");
      const tripState = db.prepare("SELECT status,guide_id FROM schedules WHERE id=?").get(def.trip.id);
      assert.equal(tripState.status, index < 2 ? "recruiting" : "confirmed");
      return { enrollmentId: joined.enrollmentId, seatNo: joined.seatNo, payStatus: order.pay_status, amount: order.payAmount, formation: tripState.status };
    }, [def.ready]);
    await step(`${def.label}：3个真实报名达到成团并自动匹配导游`, async () => {
      assert.equal(def.trip.enrollments.length, 3);
      const detail = await request("GET", `/schedules/${def.trip.id}`);
      const raw = db.prepare("SELECT * FROM schedules WHERE id=?").get(def.trip.id);
      assert.equal(raw.status, "confirmed"); assert.ok(raw.guide_id);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE schedule_id=? AND status='joined'").get(raw.id).n, 3);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_virtual=1").get().n, 0);
      def.trip.guideId = raw.guide_id;
      return { enrolled: detail.enrolled, minGroupSize: raw.min_group_size, guideId: raw.guide_id, virtualUsers: 0 };
    });
  }
  const company = definitions[2];
  let companySettled = false;
  if (company.trip) companySettled = await step("公司统一结算：非发起人拒绝，发起人 mock 支付全部3人且不能重复扣款", async () => {
    await request("POST", "/pay/company-settle", { token: users[12].token, body: { scheduleId: company.trip.id }, expected: 403 });
    const settled = await request("POST", "/pay/company-settle", { token: company.organizer.token, body: { scheduleId: company.trip.id } });
    assert.equal(settled.mock, true); assert.equal(settled.count, 3); assert.equal(settled.total, 360);
    for (const enrollment of company.trip.enrollments) {
      assert.equal(db.prepare("SELECT pay_status FROM enrollments WHERE id=?").get(enrollment.id).pay_status, "paid");
    }
    await request("POST", "/pay/company-settle", { token: company.organizer.token, body: { scheduleId: company.trip.id }, expected: 400 });
    return settled;
  });
  if (!companySettled && company.trip) {
    report.companyFailureState = {
      enrollments: db.prepare("SELECT id,status,pay_status,pay_amount FROM enrollments WHERE schedule_id=?").all(company.trip.id),
      payments: db.prepare("SELECT id,amount,status,trade_no FROM payments WHERE schedule_id=?").all(company.trip.id),
    };
  }
  await step("公司支付闭环：统一支付后3个订单均paid", async () => {
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE schedule_id=? AND pay_status='paid'").get(company.trip.id).n, 3);
  }, [companySettled]);
  const splitRefund = await step("退款：新增报名、分两笔支付、越权取消拒绝、本人取消原付款人退款", async () => {
    const approved = await request("POST", "/schedules", { token: users[0].token, body: { routeId: definitions[0].trip.routeId, organizerType: "individual", startDate: chinaDate(15), busTypeId: "coaster10", minGroupSize: 2, meetupPoint: "东直门东方银座C口", offerType: "full", heatMode: "off" } });
    const trip = { id: approved.id }, user = users[12];
    report.trips.push({ ...trip, key: "refund", type: "individual", label: "分笔支付退款隔离团" });
    const joined = await request("POST", "/enroll", { token: user.token, body: enrollBody(user, trip) });
    const first = await pay(user, joined.enrollmentId, 40); assert.equal(first.payStatus, "unpaid");
    await pay(user, joined.enrollmentId);
    await request("POST", `/orders/${joined.enrollmentId}/cancel`, { token: users[13].token, expected: 403 });
    const cancelled = await request("POST", `/orders/${joined.enrollmentId}/cancel`, { token: user.token });
    const rows = db.prepare("SELECT amount,refunded_amount,status FROM payments WHERE enrollment_id=?").all(joined.enrollmentId);
    assert.equal(rows.reduce((sum, item) => sum + item.refunded_amount, 0), 99);
    assert.equal(db.prepare("SELECT status FROM enrollments WHERE id=?").get(joined.enrollmentId).status, "cancelled");
    return { enrollmentId: joined.enrollmentId, cancelled, payments: rows };
  });
  if (!splitRefund) {
    const trip = report.trips.find((item) => item.key === "refund");
    if (trip) report.refundFailureState = {
      enrollments: db.prepare("SELECT id,status,pay_status,pay_amount FROM enrollments WHERE schedule_id=?").all(trip.id),
      payments: db.prepare("SELECT id,amount,status,trade_no,refunded_amount,refund_of FROM payments WHERE schedule_id=?").all(trip.id),
    };
  }
  await step("退款对照：单笔mock支付、本人取消、全额退款和报名状态一致", async () => {
    const approved = await request("POST", "/schedules", { token: users[0].token, body: { routeId: definitions[0].trip.routeId, organizerType: "individual", startDate: chinaDate(16), busTypeId: "coaster10", minGroupSize: 2, meetupPoint: "东直门东方银座C口", offerType: "full", heatMode: "off" } });
    const trip = { id: approved.id }, user = users[13];
    report.trips.push({ ...trip, key: "single-refund", type: "individual", label: "单笔支付退款对照团" });
    const joined = await request("POST", "/enroll", { token: user.token, body: enrollBody(user, trip) });
    const charged = await pay(user, joined.enrollmentId);
    const cancelled = await request("POST", `/orders/${joined.enrollmentId}/cancel`, { token: user.token });
    const original = db.prepare("SELECT amount,refunded_amount FROM payments WHERE enrollment_id=? AND refund_of=0").get(joined.enrollmentId);
    assert.equal(original.refunded_amount, charged.charged);
    assert.equal(db.prepare("SELECT SUM(amount) AS n FROM payments WHERE enrollment_id=? AND status='refunded'").get(joined.enrollmentId).n, charged.charged);
    assert.equal(db.prepare("SELECT status FROM enrollments WHERE id=?").get(joined.enrollmentId).status, "cancelled");
    return { enrollmentId: joined.enrollmentId, cancelled, original };
  });
  await step("权限：用户token不能访问后台/导游端，游客不能查看他人订单", async () => {
    await request("GET", "/admin/dashboard", { token: users[0].token, expected: 401 });
    await request("GET", "/guide/me", { token: users[0].token, expected: 401 });
    await request("GET", `/orders/${definitions[0].trip.enrollments[0].id}`, { token: users[12].token, expected: 404 });
    await request("POST", "/enroll", { body: enrollBody(users[12], definitions[0].trip), expected: 401 });
  });
  await step("导游端：图片验证码和模拟短信登录，错误验证码拒绝", async () => {
    const sent = await request("POST", "/auth/sms", { body: { phone: "13700001101", scene: "guide", ...await captcha() } });
    assert.equal(sent.demoCode, "888888");
    await request("POST", "/guide/login", { body: { phone: "13700001101", code: "000000" }, expected: 400 });
    guideToken = (await request("POST", "/guide/login", { body: { phone: "13700001101", code: sent.demoCode } })).token;
    const list = await request("GET", "/guide/schedules", { token: guideToken });
    for (const def of definitions) assert.ok(list.some((trip) => trip.id === def.trip.id));
    return { guidePhone: "13700001101", scheduleIds: list.map((trip) => trip.id) };
  });
  for (const def of definitions) {
    if (!def.trip) continue;
    await step(`${def.label}导游：开团前电话脱敏，提前开团/结束均拒绝`, async () => {
      const detail = await request("GET", `/guide/schedules/${def.trip.id}`, { token: guideToken });
      assert.equal(detail.roster.length, 3);
      assert.ok(detail.roster.every((row) => !row.phonesVisible && /\*/.test(row.phone)));
      await request("POST", `/guide/schedules/${def.trip.id}/start`, { token: guideToken, expected: 400 });
      await request("POST", `/guide/schedules/${def.trip.id}/complete`, { token: guideToken, expected: 400 });
    });
    const before = db.prepare("SELECT start_date,end_date FROM schedules WHERE id=?").get(def.trip.id);
    db.prepare("UPDATE schedules SET start_date=?,end_date=? WHERE id=?").run(chinaDate(), chinaDate(), def.trip.id);
    report.fixtures.push({ scheduleId: def.trip.id, action: "advance isolated fixture to departure day", before, after: chinaDate() });
    await step(`${def.label}导游：当天开团、幂等重试、电话解密和旅客详情`, async () => {
      const start = await request("POST", `/guide/schedules/${def.trip.id}/start`, { token: guideToken });
      assert.ok(start.startedAt); assert.equal(start.already, false);
      assert.ok(start.roster.every((row) => row.phonesVisible && /^1\d{10}$/.test(row.phone)));
      const repeat = await request("POST", `/guide/schedules/${def.trip.id}/start`, { token: guideToken }); assert.equal(repeat.already, true);
      const traveler = await request("GET", `/guide/schedules/${def.trip.id}/travelers/${def.trip.enrollments[0].id}`, { token: guideToken });
      assert.ok(traveler.phonesVisible); assert.match(traveler.idCard, /\*/);
      return { startedAt: start.startedAt, roster: start.roster.map((row) => ({ enrollmentId: row.id, phonesVisible: row.phonesVisible })) };
    });
    for (const stopKey of ["depart", "stop-1"]) await step(`${def.label}导游：${stopKey}签到、重复开轮拒绝、全员确认`, async () => {
      const opened = await request("POST", `/guide/schedules/${def.trip.id}/checkins`, { token: guideToken, body: { stopKey } });
      const sessionId = opened.checkin.openSession.id;
      await request("POST", `/guide/schedules/${def.trip.id}/checkins`, { token: guideToken, body: { stopKey }, expected: 400 });
      for (const enrollment of def.trip.enrollments) await request("POST", `/guide/schedules/${def.trip.id}/checkin`, { token: guideToken, body: { enrollmentId: enrollment.id } });
      const done = await request("POST", `/guide/schedules/${def.trip.id}/checkins/${sessionId}/confirm`, { token: guideToken });
      assert.equal(done.checkin.openSession, null);
      const session = done.checkin.sessions.find((item) => item.id === sessionId);
      assert.equal(session.status, "confirmed"); assert.equal(session.markedCount, 3);
      return { sessionId, status: session.status, markedCount: session.markedCount };
    });
    await step(`${def.label}导游：完成行程、全员完成同步、幂等重试、结束后报名拒绝`, async () => {
      const completed = await request("POST", `/guide/schedules/${def.trip.id}/complete`, { token: guideToken });
      assert.equal(completed.already, false); assert.equal(completed.count, 3);
      assert.equal((await request("POST", `/guide/schedules/${def.trip.id}/complete`, { token: guideToken })).already, true);
      for (const user of def.people) assert.equal((await request("GET", `/schedules/${def.trip.id}/after`, { token: user.token })).completed, true);
      await request("POST", "/enroll", { token: users[12].token, body: enrollBody(users[12], def.trip), expected: 400 });
      return { completedAt: completed.completedAt, completedTravelers: completed.count };
    });
    await step(`${def.label}行后：参加者评价、重复评价和未报名者评价拒绝`, async () => {
      const user = def.people[0];
      await request("POST", "/reviews", { token: user.token, body: { scheduleId: def.trip.id, rating: 5, content: "隔离全流程测试，行程已完成。" } });
      await request("POST", "/reviews", { token: user.token, body: { scheduleId: def.trip.id, rating: 5, content: "重复" }, expected: 400 });
      await request("POST", "/reviews", { token: users[13].token, body: { scheduleId: def.trip.id, rating: 5, content: "未参加" }, expected: 400 });
      assert.equal((await request("GET", `/schedules/${def.trip.id}/reviews`)).count, 1);
    });
  }
  await step("汇总：账本、签到、非虚拟用户和外网零调用", async () => {
    assert.deepEqual(attemptedExternalRequests, []);
    return {
      registeredAccounts: report.accounts.length,
      activeJoined: db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE status='joined'").get().n,
      confirmedCheckinRounds: db.prepare("SELECT COUNT(*) AS n FROM checkin_sessions WHERE status='confirmed'").get().n,
      payments: db.prepare("SELECT COUNT(*) AS n, SUM(amount) AS amount, SUM(refunded_amount) AS refunded FROM payments").get(),
      completedSchedules: db.prepare("SELECT COUNT(*) AS n FROM schedules WHERE completed_at IS NOT NULL AND completed_at!=''").get().n,
      externalRequests: attemptedExternalRequests.length,
    };
  });
}

run().catch((error) => {
  report.fatalError = error.stack;
  console.error(error.stack);
  process.exitCode = 1;
}).finally(async () => {
  report.finishedAt = new Date().toISOString();
  report.summary = Object.fromEntries(["pass", "fail", "blocked"].map((status) => [status, report.cases.filter((item) => item.status === status).length]));
  report.summary.requests = apiTrace.length;
  report.summary.accounts = report.accounts.length;
  report.externalRequests = attemptedExternalRequests;
  const accountExport = JSON.parse(JSON.stringify(report.accounts, publicReplacer));
  fs.writeFileSync(path.join(output, "accounts.json"), JSON.stringify(accountExport, null, 2));
  const privateFile = path.join(output, "state.private.json");
  fs.writeFileSync(privateFile, JSON.stringify({ origin, database: config.dbFile, accounts: report.accounts, adminToken, guideToken, trips: report.trips }, null, 2), { mode: 0o600 });
  fs.chmodSync(privateFile, 0o600);
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, publicReplacer, 2));
  fs.writeFileSync(path.join(output, "api-trace.json"), JSON.stringify(apiTrace, publicReplacer, 2));
  db.pragma("wal_checkpoint(TRUNCATE)");
  if (server) await new Promise((resolve) => server.close(resolve));
  console.log(JSON.stringify({ output, summary: report.summary, database: config.dbFile }));
  if (report.summary.fail || report.summary.blocked || report.fatalError) process.exitCode = 1;
});
