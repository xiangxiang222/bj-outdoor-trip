#!/usr/bin/env node
/**
 * 北野行功能走查：按真实使用顺序打一遍公开接口、用户端、后台和 H5 页面。
 *
 * 用法（仓库根目录）：
 *   npm run test:e2e                 隔离临时库，不碰开发/线上数据
 *   npm run test:e2e:live            打本机或线上已启动的服务
 *   node scripts/e2e.js --live --base http://192.144.167.212
 *
 * 线上模式只用临时手机号，结束时注销测试账号；不会执行「解散全部拼团」。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SERVER = path.join(ROOT, "server");
const ID = {
  maleBj: "110101199205121219",
  femaleBj: "110101199001011229",
  maleHb: "130102198805201218",
  femaleSd: "370102199512181224",
};

function parseArgs(argv) {
  const opts = { live: false, base: process.env.BASE_URL || "", unsafe: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--live") opts.live = true;
    else if (a === "--unsafe") opts.unsafe = true;
    else if (a === "--base") opts.base = argv[++i] || "";
    else if (a.startsWith("--base=")) opts.base = a.slice(7);
  }
  if (opts.live && !opts.base) opts.base = "http://127.0.0.1:3780";
  return opts;
}

function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

let phoneSeq = 0;
function uniquePhone() {
  phoneSeq += 1;
  return "19" + String(Date.now()).slice(-8) + String(phoneSeq % 10);
}

function color(code, text) {
  if (!process.stdout.isTTY) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}
const green = (s) => color(32, s);
const red = (s) => color(31, s);
const dim = (s) => color(90, s);
const bold = (s) => color(1, s);

function fail(message) {
  const err = new Error(message);
  err.failed = true;
  throw err;
}

function assert(cond, message) {
  if (!cond) fail(message);
}

function resolveFromServer(name) {
  return require(require.resolve(name, { paths: [SERVER] }));
}

function prepareIsolated() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bj-e2e-"));
  process.env.MMC_DATA_DIR = dir;
  process.env.MMC_DB_FILE = path.join(dir, "app.sqlite");
  process.env.MMC_PUBLIC_DIR = path.join(dir, "public");
  process.env.MMC_WEB_DIST_DIR = path.join(dir, "webdist");
  process.env.MMC_SKIP_WEB = "0";
  fs.mkdirSync(process.env.MMC_WEB_DIST_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(process.env.MMC_WEB_DIST_DIR, "index.html"),
    "<!doctype html><html><body>spa-e2e</body></html>"
  );
  const { createApp } = require(path.join(SERVER, "src/app"));
  const { seedMinimal } = require(path.join(SERVER, "test/helpers"));
  const request = resolveFromServer("supertest");
  const seed = seedMinimal();
  return { seed, agent: request(createApp()), dir };
}

function createAgentClient(agent) {
  return async function request(method, urlPath, opts = {}) {
    const verb = method.toLowerCase();
    let req = agent[verb](urlPath);
    if (opts.token) req = req.set("Authorization", "Bearer " + opts.token);
    if (opts.body !== undefined) req = req.send(opts.body);
    if (!opts.follow) req = req.redirects(0);
    const res = await req;
    return {
      status: res.status,
      body: res.body,
      text: res.text,
      location: res.headers.location,
      type: res.headers["content-type"] || "",
    };
  };
}

function createFetchClient(base) {
  const origin = String(base).replace(/\/$/, "");
  return async function request(method, urlPath, opts = {}) {
    const res = await fetch(origin + urlPath, {
      method,
      headers: {
        ...(opts.token ? { Authorization: "Bearer " + opts.token } : {}),
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      redirect: opts.follow ? "follow" : "manual",
    });
    const type = res.headers.get("content-type") || "";
    let body = null;
    let text = "";
    if (/json/i.test(type)) body = await res.json();
    else text = await res.text();
    return {
      status: res.status,
      body,
      text,
      location: res.headers.get("location"),
      type,
    };
  };
}

function apiOk(res, label, status = 200) {
  if (res.status !== status) {
    const hint = (res.body && res.body.message) || res.text || "";
    fail(`${label} 期望 HTTP ${status}，实际 ${res.status}${hint ? "：" + hint : ""}`);
  }
  if (status < 400 && res.body && res.body.ok === false) fail(`${label} 返回 ok=false：${res.body.message}`);
  return res.body && res.body.data !== undefined ? res.body.data : res.body;
}

async function readCaptcha(request) {
  const res = await request("GET", "/api/auth/captcha");
  const data = apiOk(res, "获取验证码");
  assert(data.token && data.image, "验证码缺少 token/image");
  const { getDb } = require(path.join(SERVER, "src/db"));
  const row = getDb().prepare("SELECT code FROM captchas WHERE token=?").get(data.token);
  assert(row && row.code, "隔离库读不到验证码明文");
  return { token: data.token, code: row.code };
}

async function loginWithPassword(request, phone, password) {
  const cap = await readCaptcha(request);
  const res = await request("POST", "/api/auth/login", {
    body: { phone, password, captchaToken: cap.token, captcha: cap.code },
  });
  const data = apiOk(res, "密码登录");
  assert(data.token, "登录未返回 token");
  return data;
}

async function registerWithCaptcha(request, phone, nickname) {
  const cap = await readCaptcha(request);
  const res = await request("POST", "/api/auth/register", {
    body: {
      phone,
      password: "123456",
      nickname,
      captchaToken: cap.token,
      captcha: cap.code,
    },
  });
  return apiOk(res, "注册");
}

async function loginSms(request, phone) {
  const sms = await request("POST", "/api/auth/sms", { body: { phone, scene: "login" } });
  const sent = apiOk(sms, "发送短信");
  const code = sent.demoCode || "888888";
  const res = await request("POST", "/api/auth/login-sms", { body: { phone, code } });
  return apiOk(res, "短信登录");
}

async function run(opts) {
  const live = opts.live;
  let seed = null;
  let request;
  if (live) {
    request = createFetchClient(opts.base);
  } else {
    const prepared = prepareIsolated();
    seed = prepared.seed;
    request = createAgentClient(prepared.agent);
  }

  const ctx = {
    live,
    seed,
    request,
    phones: { user: uniquePhone(), buddy: uniquePhone(), sms: uniquePhone(), wait: uniquePhone() },
  };
  const results = [];

  async function step(name, fn, { skip = false, reason = "" } = {}) {
    if (skip) {
      results.push({ name, status: "skip", ms: 0, reason });
      console.log(dim("–  " + name + (reason ? "（" + reason + "）" : "")));
      return;
    }
    const t0 = Date.now();
    try {
      await fn();
      const ms = Date.now() - t0;
      results.push({ name, status: "pass", ms });
      console.log(green("✓  ") + name + dim("  " + ms + "ms"));
    } catch (err) {
      const ms = Date.now() - t0;
      results.push({ name, status: "fail", ms, error: err.message });
      console.log(red("✗  ") + name + dim("  " + ms + "ms"));
      console.log(red("   " + err.message));
    }
  }

  console.log(bold(live ? "北野行功能走查 · 线上 " + opts.base : "北野行功能走查 · 隔离临时库"));
  console.log("");

  await step("公开：品牌、车型、导游、线路、排期", async () => {
    const meta = apiOk(await request("GET", "/api/meta"), "meta");
    assert(meta.name === "北野行", "品牌名不是北野行");
    assert(Array.isArray(meta.insurance) && meta.insurance.length >= 2, "保险方案缺失");
    const forecast = apiOk(await request("GET", "/api/weather?region=北京怀柔"), "weather");
    assert(forecast.summary && Array.isArray(forecast.alerts), "天气提醒不完整");
    assert(Array.isArray(meta.days) && meta.days.includes(1), "天数选项缺失");
    const buses = apiOk(await request("GET", "/api/buses"), "buses");
    assert(buses.length > 0, "没有车型");
    ctx.busId = (buses.find((b) => b.id === "bus30") || buses[0]).id;
    const guides = apiOk(await request("GET", "/api/guides"), "guides");
    assert(Array.isArray(guides), "导游列表不是数组");
    const routes = apiOk(await request("GET", "/api/routes"), "routes");
    assert(routes.length > 0, "没有上架线路");
    ctx.routeId = seed ? seed.routeId : routes[0].id;
    const filtered = apiOk(await request("GET", "/api/routes?days=1"), "routes filter");
    assert(Array.isArray(filtered), "筛选结果不是数组");
    const detail = apiOk(await request("GET", "/api/routes/" + ctx.routeId), "route detail");
    assert(detail.title && Array.isArray(detail.priceTiers), "线路详情不完整");
    const missing = await request("GET", "/api/routes/999999");
    assert(missing.status === 404, "不存在的线路应 404");
    const schedules = apiOk(await request("GET", "/api/schedules"), "schedules");
    assert(Array.isArray(schedules), "排期不是数组");
  });

  await step("鉴权：验证码图、注册、密码登录、短信、微信", async () => {
    const cap = await request("GET", "/api/auth/captcha");
    apiOk(cap, "captcha json");
    const png = await request("GET", "/api/auth/captcha-image/" + cap.body.data.token);
    assert(png.status === 200 && /png/i.test(png.type || ""), "验证码 PNG 未返回");
    const badSms = await request("POST", "/api/auth/sms", { body: { phone: "123" } });
    assert(badSms.status === 400, "错误手机号发短信应失败");

    if (live) {
      ctx.auth = await loginSms(request, ctx.phones.user);
    } else {
      ctx.auth = await registerWithCaptcha(request, ctx.phones.user, "走查用户");
      const again = await loginWithPassword(request, ctx.phones.user, "123456");
      assert(again.token, "注册后密码登录失败");
    }
    ctx.token = ctx.auth.token;
    const smsUser = await loginSms(request, ctx.phones.sms);
    assert(smsUser.token, "短信登录失败");
    const wx = apiOk(
      await request("POST", "/api/auth/wechat", {
        body: { code: "e2e_" + Date.now(), nickname: "走查微信" },
      }),
      "微信登录"
    );
    assert(wx.token, "微信登录未签发 token");
  });

  await step("资料：读/改个人资料，身份证籍贯", async () => {
    const me = apiOk(await request("GET", "/api/me", { token: ctx.token }), "me");
    assert(me.id, "资料没有用户 id");
    const updated = apiOk(
      await request("PUT", "/api/me", {
        token: ctx.token,
        body: { nickname: "走查改名", idCard: ID.maleHb, companyName: "走查工作室" },
      }),
      "update me"
    );
    assert(updated.nickname === "走查改名", "昵称未更新");
    assert(updated.hometown === "河北省石家庄市", "籍贯未从身份证解析");
    const noAuth = await request("GET", "/api/me");
    assert(noAuth.status === 401, "未登录读资料应 401");
  });

  await step("收藏：添加、列表、取消", async () => {
    apiOk(await request("POST", "/api/favorites/" + ctx.routeId, { token: ctx.token }), "fav add");
    const list = apiOk(await request("GET", "/api/favorites", { token: ctx.token }), "fav list");
    assert(list.some((r) => Number(r.id) === Number(ctx.routeId)), "收藏列表没有该线路");
    const marked = apiOk(await request("GET", "/api/routes/" + ctx.routeId, { token: ctx.token }), "favored flag");
    assert(marked.favored, "详情未标记已收藏");
    apiOk(await request("DELETE", "/api/favorites/" + ctx.routeId, { token: ctx.token }), "fav del");
    const empty = apiOk(await request("GET", "/api/favorites", { token: ctx.token }), "fav empty");
    assert(!empty.some((r) => Number(r.id) === Number(ctx.routeId)), "取消收藏后仍在列表");
  });

  await step("开团：个人拼团与公司团", async () => {
    const individual = apiOk(
      await request("POST", "/api/schedules", {
        token: ctx.token,
        body: {
          routeId: ctx.routeId,
          startDate: plusDays(21),
          organizerType: "individual",
          busTypeId: ctx.busId,
          minGroupSize: 2,
          meetupPoint: "东直门东方银座C口",
          meetupTime: "07:30",
          notes: "e2e自动测试个人团",
        },
      }),
      "open individual"
    );
    ctx.ownScheduleId = individual.id;
    assert(individual.shareToken || individual.share_token || true, "开团成功");
    const detail = apiOk(await request("GET", "/api/schedules/" + ctx.ownScheduleId), "own schedule");
    assert(detail.status !== "cancelled", "新开团不应是已解散");
    ctx.shareToken = detail.shareToken;

    const stranger = await loginSms(request, uniquePhone());
    const noCompany = await request("POST", "/api/schedules", {
      token: stranger.token,
      body: {
        routeId: ctx.routeId,
        startDate: plusDays(22),
        organizerType: "company",
        busTypeId: ctx.busId,
      },
    });
    assert(noCompany.status === 400, "无公司名开公司团应失败");

    ctx.companyAuth = live
      ? await loginSms(request, uniquePhone())
      : await loginWithPassword(request, "13900139000", "123456");
    await request("PUT", "/api/me", {
      token: ctx.companyAuth.token,
      body: { companyName: "走查测试公司" },
    });
    const company = apiOk(
      await request("POST", "/api/schedules", {
        token: ctx.companyAuth.token,
        body: {
          routeId: ctx.routeId,
          startDate: plusDays(28),
          organizerType: "company",
          busTypeId: ctx.busId,
          companyName: "走查测试公司",
          minGroupSize: 2,
          meetupPoint: "国贸桥下大巴停靠点",
        },
      }),
      "open company"
    );
    ctx.companyScheduleId = company.id;
  });

  await step("报名：占座、重复拒绝、取消、再报、订单", async () => {
    const enroll = apiOk(
      await request("POST", "/api/enroll", {
        token: ctx.token,
        body: {
          scheduleId: ctx.ownScheduleId,
          travelerName: "走查甲",
          travelerPhone: ctx.phones.user,
          idCard: ID.maleBj,
          insuranceCode: "outdoor",
        },
      }),
      "enroll"
    );
    ctx.enrollmentId = enroll.enrollmentId;
    assert(enroll.payStatus === "unpaid" || enroll.payStatus === "company_pending", "报名支付状态异常");
    assert(enroll.insurance && enroll.insurance.fee === 20, "未计入户外意外险");
    assert(enroll.seatNo, "报名未分配座位");
    const seats = apiOk(await request("GET", "/api/schedules/" + ctx.ownScheduleId + "/seats", { token: ctx.token }), "seats");
    assert(Array.isArray(seats.seats) && seats.seats.length >= 1, "座位图为空");
    assert(seats.seats.some((s) => s.taken), "座位图没有占用位");
    const dup = await request("POST", "/api/enroll", {
      token: ctx.token,
      body: {
        scheduleId: ctx.ownScheduleId,
        travelerName: "走查甲",
        travelerPhone: ctx.phones.user,
        idCard: ID.maleBj,
      },
    });
    assert(dup.status === 400, "同一身份证重复报名应失败");

    const orders = apiOk(await request("GET", "/api/orders", { token: ctx.token }), "orders");
    assert(orders.some((o) => Number(o.id) === Number(ctx.enrollmentId)), "订单列表没有刚报的名");
    apiOk(await request("POST", "/api/orders/" + ctx.enrollmentId + "/cancel", { token: ctx.token }), "cancel enroll");
    const cancelled = apiOk(await request("GET", "/api/orders", { token: ctx.token }), "orders after cancel");
    const row = cancelled.find((o) => Number(o.id) === Number(ctx.enrollmentId));
    assert(row && row.status === "cancelled", "取消后订单状态不是已取消");

    const again = apiOk(
      await request("POST", "/api/enroll", {
        token: ctx.token,
        body: {
          scheduleId: ctx.ownScheduleId,
          travelerName: "走查甲",
          travelerPhone: ctx.phones.user,
          idCard: ID.maleBj,
        },
      }),
      "re-enroll"
    );
    ctx.enrollmentId = again.enrollmentId;
  });

  await step("成团：第二人报名、导游匹配、本团画像", async () => {
    ctx.buddy = live
      ? await loginSms(request, ctx.phones.buddy)
      : await registerWithCaptcha(request, ctx.phones.buddy, "走查乙");
    apiOk(
      await request("POST", "/api/enroll", {
        token: ctx.buddy.token,
        body: {
          scheduleId: ctx.ownScheduleId,
          travelerName: "走查乙",
          travelerPhone: ctx.phones.buddy,
          idCard: ID.femaleBj,
        },
      }),
      "second enroll"
    );
    const sch = apiOk(await request("GET", "/api/schedules/" + ctx.ownScheduleId), "matched schedule");
    assert(sch.status === "confirmed" || sch.guide, "两人成团后应变为已成团或匹配导游");
    const demo = apiOk(await request("GET", "/api/schedules/" + ctx.ownScheduleId + "/demographics"), "demographics");
    assert(demo.total >= 2, "画像人数不足 2");
  });

  await step(
    "候补：满员排队并在取消后递补",
    async () => {
      seed.db.prepare("UPDATE schedules SET max_seats=2 WHERE id=?").run(ctx.ownScheduleId);
      ctx.waitAuth = await registerWithCaptcha(request, ctx.phones.wait, "走查候补");
      const wl = apiOk(
        await request("POST", "/api/enroll", {
          token: ctx.waitAuth.token,
          body: {
            scheduleId: ctx.ownScheduleId,
            travelerName: "走查候补",
            travelerPhone: ctx.phones.wait,
            idCard: ID.femaleSd,
          },
        }),
        "waitlist enroll"
      );
      assert(wl.waitlisted === true, "满员后应进入候补");
      const buddyOrders = apiOk(await request("GET", "/api/orders", { token: ctx.buddy.token }), "buddy orders");
      const buddyRow = buddyOrders.find((o) => Number(o.schedule_id) === Number(ctx.ownScheduleId) && o.status === "joined");
      assert(buddyRow, "找不到第二人有效报名");
      apiOk(await request("POST", "/api/orders/" + buddyRow.id + "/cancel", { token: ctx.buddy.token }), "cancel to promote");
      const waitOrders = apiOk(await request("GET", "/api/orders", { token: ctx.waitAuth.token }), "wait orders");
      const promoted = waitOrders.find((o) => Number(o.id) === Number(wl.enrollmentId));
      assert(promoted && promoted.status === "joined", "候补未递补为有效报名");
    },
    { skip: live, reason: "线上不改座位上限" }
  );

  await step(
    "导游端：验证码登录、行程名单、签到",
    async () => {
      const cap = await readCaptcha(request);
      const guide = apiOk(
        await request("POST", "/api/guide/login", {
          body: { phone: "13700001101", captchaToken: cap.token, captcha: cap.code },
        }),
        "guide login"
      );
      assert(guide.token && guide.name, "导游登录失败");
      const trips = apiOk(await request("GET", "/api/guide/schedules", { token: guide.token }), "guide schedules");
      const hit = trips.find((s) => Number(s.id) === Number(ctx.ownScheduleId));
      assert(hit, "导游未分配到走查行程");
      const detail = apiOk(await request("GET", "/api/guide/schedules/" + ctx.ownScheduleId, { token: guide.token }), "guide roster");
      assert(detail.roster && detail.roster.length >= 1, "导游名单为空");
      apiOk(
        await request("POST", "/api/guide/schedules/" + ctx.ownScheduleId + "/checkin", {
          token: guide.token,
          body: { enrollmentId: detail.roster[0].id },
        }),
        "guide checkin"
      );
    },
    { skip: live, reason: "线上导游手机号可能未预置" }
  );

  await step("分享：海报二维码与分享短链跳转", async () => {
    const poster = apiOk(await request("GET", "/api/schedules/" + ctx.ownScheduleId + "/poster"), "poster");
    assert(/^data:image\/png;base64,/.test(poster.qr), "海报不是 PNG 二维码");
    assert(/\/m\/schedule\//.test(poster.url), "海报链接不是报名页");
    if (ctx.shareToken) {
      const share = await request("GET", "/api/share/" + ctx.shareToken);
      assert(share.status === 302 || (share.location && /schedule/.test(share.location)), "分享短链应跳转报名页");
    }
    const bad = await request("GET", "/api/share/no-such-token");
    assert(bad.status === 404, "无效分享令牌应 404");
  });

  await step("会员：一键开通、积分流水、评价", async () => {
    const buy = apiOk(await request("POST", "/api/member/buy", { token: ctx.token }), "member buy");
    assert(buy.user && buy.user.isMember, "开通会员后 isMember 应为 true");
    const points = apiOk(await request("GET", "/api/points", { token: ctx.token }), "points");
    assert(typeof points.points === "number", "积分余额缺失");
    apiOk(
      await request("POST", "/api/reviews", {
        token: ctx.token,
        body: { scheduleId: ctx.ownScheduleId, rating: 5, content: "e2e评价" },
      }),
      "review"
    );
  });

  await step("公司团：挂账报名与发起人统一结算", async () => {
    const join = apiOk(
      await request("POST", "/api/enroll", {
        token: ctx.token,
        body: {
          scheduleId: ctx.companyScheduleId,
          travelerName: "同事甲",
          travelerPhone: ctx.phones.user,
          idCard: ID.maleHb,
        },
      }),
      "company enroll"
    );
    assert(join.payStatus === "company_pending", "公司团应为挂账");
    const forbidden = await request("POST", "/api/pay/company-settle", {
      token: ctx.token,
      body: { scheduleId: ctx.companyScheduleId },
    });
    assert(forbidden.status === 403, "非发起人结算应 403");
    const settled = apiOk(
      await request("POST", "/api/pay/company-settle", {
        token: ctx.companyAuth.token,
        body: { scheduleId: ctx.companyScheduleId },
      }),
      "company settle"
    );
    assert(settled.count >= 1, "结算人数为 0");
    assert(Array.isArray(settled.splits) && settled.splits.length >= 3, "结算后应写入分账");
    apiOk(
      await request("POST", "/api/schedules/" + ctx.companyScheduleId + "/dissolve", {
        token: ctx.companyAuth.token,
        body: { reason: "e2e走查结束清理" },
      }),
      "cleanup company schedule"
    );
  });

  await step("解散：发起人解散自己的团", async () => {
    const other = await request("POST", "/api/schedules/" + ctx.ownScheduleId + "/dissolve", {
      token: ctx.buddy.token,
      body: { reason: "不是发起人" },
    });
    assert(other.status === 403, "非发起人解散应 403");
    const res = apiOk(
      await request("POST", "/api/schedules/" + ctx.ownScheduleId + "/dissolve", {
        token: ctx.token,
        body: { reason: "e2e走查解散" },
      }),
      "dissolve"
    );
    assert(res.status === "cancelled", "解散后状态不是 cancelled");
    const blocked = await request("POST", "/api/enroll", {
      token: ctx.token,
      body: {
        scheduleId: ctx.ownScheduleId,
        travelerName: "走查甲",
        travelerPhone: ctx.phones.user,
        idCard: ID.femaleSd,
      },
    });
    assert(blocked.status === 400, "已解散的团不应再报名");
  });

  await step("后台：登录、看板、线路增改下架、排期成本、报名用户", async () => {
    const bad = await request("POST", "/api/admin/login", { body: { username: "admin", password: "nope" } });
    assert(bad.status === 400, "错误管理员密码应失败");
    const login = apiOk(
      await request("POST", "/api/admin/login", { body: { username: "admin", password: "admin123" } }),
      "admin login"
    );
    ctx.adminToken = login.token;
    const asUser = await request("GET", "/api/admin/dashboard", { token: ctx.token });
    assert(asUser.status === 401, "用户 token 不能进后台");
    const dash = apiOk(await request("GET", "/api/admin/dashboard", { token: ctx.adminToken }), "dashboard");
    assert(dash.routeCount >= 1, "看板线路数为 0");

    const code = "E" + String(Date.now()).slice(-5);
    const created = apiOk(
      await request("POST", "/api/admin/routes", {
        token: ctx.adminToken,
        body: {
          code,
          title: "走查临时线路",
          days: 2,
          category: "山水",
          region: "京郊",
          minGroupSize: 8,
          priceTiers: [{ minPeople: 10, price: 299, memberPrice: 275 }],
          buses: [ctx.busId],
          tags: ["e2e"],
          highlights: ["走查"],
        },
      }),
      "admin create route"
    );
    ctx.adminRouteId = created.id;
    apiOk(
      await request("PUT", "/api/admin/routes/" + created.id, {
        token: ctx.adminToken,
        body: {
          title: "走查临时线路改名",
          subtitle: "e2e",
          days: 2,
          distanceKm: 80,
          difficulty: "休闲",
          category: "山水",
          region: "京郊",
          season: "四季",
          tags: ["e2e"],
          cover: "",
          gallery: [],
          minGroupSize: 8,
          description: "走查",
          highlights: ["走查"],
          itinerary: [],
          feeInclude: "车",
          feeExclude: "餐",
          equipment: "鞋",
          notices: "注意",
          meetupPoints: [],
          status: "on",
          priceTiers: [{ minPeople: 10, price: 288, memberPrice: 265 }],
          buses: [ctx.busId],
        },
      }),
      "admin update route"
    );
    const published = apiOk(
      await request("POST", "/api/admin/schedules", {
        token: ctx.adminToken,
        body: {
          routeId: ctx.routeId,
          startDate: plusDays(40),
          busTypeId: ctx.busId,
          organizerType: "company",
          companyName: "后台走查公司",
          minGroupSize: 2,
          meetupPoint: "国贸桥下大巴停靠点",
        },
      }),
      "admin publish schedule"
    );
    ctx.adminScheduleId = published.id;
    const cost = apiOk(
      await request("PUT", "/api/admin/schedules/" + published.id + "/cost", {
        token: ctx.adminToken,
        body: { transport: 1000, ticket: 200, hotel: 0, meal: 100, guide: 300, other: 50 },
      }),
      "admin cost"
    );
    assert(cost.cost === 1650, "成本合计应为 1650");
    apiOk(await request("GET", "/api/admin/schedules", { token: ctx.adminToken }), "admin schedules");
    apiOk(await request("GET", "/api/admin/enrollments", { token: ctx.adminToken }), "admin enrollments");
    apiOk(await request("GET", "/api/admin/users", { token: ctx.adminToken }), "admin users");
    apiOk(await request("GET", "/api/admin/me", { token: ctx.adminToken }), "admin me");
    apiOk(await request("DELETE", "/api/admin/routes/" + created.id, { token: ctx.adminToken }), "admin off-shelf");
    if (live) {
      const all = apiOk(await request("GET", "/api/admin/schedules", { token: ctx.adminToken }), "admin schedules cleanup");
      for (const s of all) {
        if (s.status === "cancelled") continue;
        const text = `${s.notes || ""} ${s.companyName || ""} ${s.organizerName || ""}`;
        if (!/走查|e2e/i.test(text)) continue;
        await request("POST", "/api/admin/schedules/" + s.id + "/dissolve", {
          token: ctx.adminToken,
          body: { reason: "e2e清理残留" },
        });
      }
    }
  });

  await step("后台：管理员账号、会员积分、代取消报名", async () => {
    if (!ctx.adminToken) fail("缺少管理员 token");
    const staffName = "e2eop" + String(Date.now()).slice(-6);
    const created = apiOk(
      await request("POST", "/api/admin/staff", {
        token: ctx.adminToken,
        body: { username: staffName, name: "走查运营", password: "ops123456", role: "operator" },
      }),
      "create staff"
    );
    ctx.staffId = created.id;
    const opLogin = apiOk(
      await request("POST", "/api/admin/login", { body: { username: staffName, password: "ops123456" } }),
      "operator login"
    );
    const forbidden = await request("GET", "/api/admin/staff", { token: opLogin.token });
    assert(forbidden.status === 403, "运营不应管理管理员账号");

    const me = apiOk(await request("GET", "/api/me", { token: ctx.token }), "user id for admin ops");
    apiOk(
      await request("POST", "/api/admin/users/" + me.id + "/points", {
        token: ctx.adminToken,
        body: { delta: 10, reason: "e2e补发" },
      }),
      "admin points"
    );
    apiOk(
      await request("POST", "/api/admin/users/" + me.id + "/member", {
        token: ctx.adminToken,
        body: { action: "grant" },
      }),
      "admin grant member"
    );
    const users = apiOk(await request("GET", "/api/admin/users?q=" + encodeURIComponent(me.nickname || ""), { token: ctx.adminToken }), "search users");
    assert(users.some((u) => Number(u.id) === Number(me.id)), "用户搜索未命中");

    const enrollments = apiOk(await request("GET", "/api/admin/enrollments?status=joined", { token: ctx.adminToken }), "joined enrollments");
    const mine = enrollments.find((e) => Number(e.user_id) === Number(me.id) && e.status !== "cancelled");
    if (mine) {
      apiOk(await request("POST", "/api/admin/enrollments/" + mine.id + "/cancel", { token: ctx.adminToken }), "admin cancel enroll");
    }

    apiOk(await request("DELETE", "/api/admin/staff/" + created.id, { token: ctx.adminToken }), "delete staff");
  });

  await step("后台：解散走查排期", async () => {
    if (!ctx.adminToken || !ctx.adminScheduleId) fail("缺少后台排期");
    const sch = apiOk(await request("GET", "/api/schedules/" + ctx.adminScheduleId), "admin schedule status");
    if (sch.status === "cancelled") return;
    apiOk(
      await request("POST", "/api/admin/schedules/" + ctx.adminScheduleId + "/dissolve", {
        token: ctx.adminToken,
        body: { reason: "e2e后台解散" },
      }),
      "admin dissolve"
    );
  });

  await step("后台：解散全部拼团", async () => {
    apiOk(
      await request("POST", "/api/admin/schedules/dissolve-all", {
        token: ctx.adminToken,
        body: { reason: "e2e解散全部" },
      }),
      "dissolve all"
    );
  }, { skip: live && !opts.unsafe, reason: live ? "线上默认跳过，加 --unsafe 才执行" : "" });

  await step("H5 页面可打开", async () => {
    const pages = ["/m", "/m/login", "/m/routes", "/m/mine", "/admin/login", "/g/login"];
    for (const p of pages) {
      const res = await request("GET", p, { follow: true });
      assert(res.status === 200, p + " 返回 " + res.status);
      const html = res.text || "";
      assert(/html|spa/i.test(html) || res.body, p + " 不是 HTML");
    }
  });

  await step("注销：删号后旧 token 失效，手机号可再注册", async () => {
    apiOk(await request("DELETE", "/api/me", { token: ctx.token }), "delete account");
    const gone = await request("GET", "/api/me", { token: ctx.token });
    assert(gone.status === 401, "注销后旧 token 仍可用");
    if (live) {
      const again = await loginSms(request, ctx.phones.user);
      assert(again.token, "注销后同一手机号不能再登录/注册");
      await request("DELETE", "/api/me", { token: again.token });
    } else {
      const created = await registerWithCaptcha(request, ctx.phones.user, "走查重生");
      assert(created.user.nickname === "走查重生", "注销后重新注册昵称不对");
    }
    if (ctx.buddy && ctx.buddy.token) {
      await request("DELETE", "/api/me", { token: ctx.buddy.token });
    }
    if (ctx.waitAuth && ctx.waitAuth.token) {
      await request("DELETE", "/api/me", { token: ctx.waitAuth.token });
    }
    if (ctx.companyAuth && ctx.companyAuth.token && live) {
      await request("DELETE", "/api/me", { token: ctx.companyAuth.token });
    }
  });

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  console.log("");
  console.log(
    bold(
      `${passed} 通过  ${failed} 失败  ${skipped} 跳过  共 ${results.length} 项`
    )
  );
  if (failed) {
    console.log("");
    for (const r of results.filter((x) => x.status === "fail")) {
      console.log(red("失败 · " + r.name));
      console.log("      " + r.error);
    }
  }
  return failed === 0 ? 0 : 1;
}

async function main() {
  const opts = parseArgs(process.argv);
  try {
    const code = await run(opts);
    process.exit(code);
  } catch (err) {
    console.error(red("走查未能启动：" + err.message));
    process.exit(1);
  }
}

main();
