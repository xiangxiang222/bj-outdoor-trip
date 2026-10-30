const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// The native controller runs with an isolated WeChat/API adapter, never a live payment.
function harness(options = {}) {
  const app = { globalData: { token:"owner-token", user:{ id:1, walletBalance:200 } } };
  const calls = { requests:[], auth:[], toasts:[], navigation:[], codes:0, invoked:[] };
  let definition;
  const filename = path.resolve(__dirname,"../../miniprogram/pages/pay/pay.js");
  const context = {
    getApp:() => app,
    Page(value) { definition = value; },
    require(id) {
      if (id.endsWith("/request")) return {
        request(...args) { calls.requests.push(args); return options.request ? options.request(...args) : Promise.resolve({ data:args[0]==="/me" ? app.globalData.user : fixture() }); },
        setAuth(token,user) { calls.auth.push({token,user}); app.globalData.token=token; app.globalData.user=user; },
      };
      if (id.endsWith("/pay")) return {
        async ensureWechatCode() { calls.codes++; return "wx-code"; },
        async invokeWechatPay(data) { calls.invoked.push(data); return options.confirm ? options.confirm(data) : data; },
      };
      if (id.endsWith("/appearance")) return { isDark:() => false };
      throw new Error("Unexpected native dependency: " + id);
    },
    wx:{ showToast(value) { calls.toasts.push(value); },navigateTo(value) { calls.navigation.push(value); },redirectTo() {} },
    setTimeout,clearTimeout,
  };
  vm.runInNewContext(fs.readFileSync(filename,"utf8"),context,{filename});
  const page = { ...definition,data:structuredClone(definition.data) };
  page.setData = function(patch) { Object.assign(this.data,patch); };
  page.onLoad({token:"booking-token",...options.query});
  return {page,app,calls};
}
function fixture(patch = {}) {
  return { token:"booking-token", enrollmentId:11, scheduleId:27, title:"周末山野一日", startDate:"2026-11-01", travelerName:"林北野", isOwner:true, canPay:true, payStatus:"unpaid", enrollmentStatus:"joined", payAmount:101, paidAmount:0, remainAmount:101, contributors:[], ...patch };
}
const mode = (page,value) => page.setMode({currentTarget:{dataset:{mode:value}}});
const amount = (page,value) => page.setAmount({detail:{value}});
const posts = (calls) => calls.requests.filter(([url,method]) => url==="/pay/for-enrollment" && method==="POST");
function deferred() { let resolve; const promise = new Promise((done) => { resolve=done; }); return { promise,resolve }; }

describe("native fee payment", () => {
  it("separates paying the remainder, asking a friend and contributing a chosen amount",async () => {
    const {page}=harness();
    await page.load();
    assert.equal(page.data.amount,"101");
    mode(page,"proxy");
    assert.equal(page.data.mode,"proxy");
    mode(page,"split");
    assert.equal(page.data.amount,"");
    page.quickAmount({currentTarget:{dataset:{kind:"half"}}});
    assert.equal(page.data.amount,"51");
    assert.match(page.onShareAppMessage().path,/&mode=split$/);
    mode(page,"self");
    assert.equal(page.data.amount,"101");
    assert.doesNotMatch(page.onShareAppMessage().path,/mode=split/);
  });

  it("preserves the contribution flow through a share link and login",async () => {
    const {page,app,calls}=harness({query:{mode:"split"},request:async (url) => ({data:url==="/me"?{walletBalance:0}:fixture({isOwner:false})})});
    app.globalData.token="";
    await page.load();
    assert.equal(page.data.mode,"split");
    assert.equal(page.data.amount,"");
    mode(page,"proxy");
    assert.equal(page.data.mode,"split","a helper cannot request proxy payment as the traveler");
    amount(page,"20");
    await page.charge("wechat");
    const login = new URL(calls.navigation[0].url,"https://test.invalid");
    assert.equal(login.searchParams.get("redirect"),"/pages/pay/pay?token=booking-token&mode=split");
    assert.equal(posts(calls).length,0);
  });

  it("rejects empty, nonpositive, fractional, non-finite and excessive amounts before creating a payment",async () => {
    const {page,calls}=harness();
    await page.load(); mode(page,"split");
    for (const value of [""," ","0","-2","1.5","Infinity","NaN","102"]) {
      amount(page,value); await page.charge("wechat");
      assert.ok(page.data.msg,"explains rejected amount " + JSON.stringify(value));
    }
    assert.equal(posts(calls).length,0);
    assert.equal(calls.codes,0);
  });

  it("prevents insufficient balance and never falls through to a different payment channel",async () => {
    const {page,app,calls}=harness();
    app.globalData.user.walletBalance=10;
    await page.load();
    app.globalData.user.walletBalance=10;
    amount(page,"101");
    await page.charge("wallet");
    assert.match(page.data.msg,/余额不足/);
    assert.equal(posts(calls).length,0);
  });

  it("makes one request while a payment is in progress and freezes the selected amount and mode",async () => {
    const wait=deferred();
    const {page,calls}=harness({request:(url,method) => method==="POST"?wait.promise:Promise.resolve({data:url==="/me"?{id:1,walletBalance:200}:fixture()})});
    await page.load(); mode(page,"split"); amount(page,"20");
    const paying=page.charge("wallet");
    await Promise.resolve();
    assert.equal(page.data.paying,true);
    mode(page,"self"); amount(page,"30");
    await page.charge("wallet");
    assert.equal(page.data.mode,"split"); assert.equal(page.data.amount,"20");
    assert.equal(posts(calls).length,1);
    wait.resolve({data:{payStatus:"unpaid",amount:20,remainAmount:81}});
    await paying;
    assert.equal(page.data.paying,false);
  });

  it("uses the confirmed WeChat result and the refreshed ledger, keeping partial payment in split mode",async () => {
    let settled=false;
    const {page,calls,app}=harness({
      request:async (url,method) => ({data:method==="POST"?{needPay:true,payStatus:"unpaid",wechatPay:{package:"test"}}:url==="/me"?{id:1,walletBalance:200}:fixture(settled?{paidAmount:20,remainAmount:81,contributors:[{userId:1,self:true,nickname:"林北野",amount:20,remark:"自己支付（分摊）"}]}:{})}),
      confirm:async () => { settled=true; return {needPay:false,payStatus:"unpaid",amount:20,user:{id:1,walletBalance:180}}; },
    });
    await page.load(); mode(page,"split"); amount(page,"20");
    await page.charge("wechat");
    assert.equal(calls.codes,1); assert.equal(calls.invoked.length,1);
    assert.ok(calls.auth.some(({user}) => user.walletBalance===180),"confirmed profile is consumed");
    assert.equal(app.globalData.user.id,1);
    assert.equal(page.data.mode,"split"); assert.equal(page.data.amount,"");
    assert.equal(page.data.data.remainAmount,81);
    assert.equal(page.data.records.length,1,"own contributions are visible");
    assert.equal(page.data.ok,true);
    assert.doesNotMatch(calls.toasts.map((item)=>item.title).join(" "),/已付清/);
  });

  it("does not announce success or allow repeat charging while the payment result is unconfirmed",async () => {
    const {page,calls}=harness();
    await page.load();
    await page.charge("wechat");
    assert.equal(page.data.paymentPending,true);
    assert.equal(page.data.ok,false);
    assert.equal(calls.toasts.length,0);
    await page.charge("wechat");
    assert.equal(posts(calls).length,1);
    await page.retry();
    assert.equal(page.data.paymentPending,true,"an unchanged ledger cannot confirm the charge");
  });

  it("has a retryable failure instead of an endless loading screen",async () => {
    let failed=true;
    const {page}=harness({request:async (url) => { if(failed && url.startsWith("/pay/share/")) throw new Error("网络不可用"); return {data:url==="/me"?{walletBalance:200}:fixture()}; }});
    await page.load();
    assert.equal(page.data.ready,true); assert.equal(page.data.refreshing,false); assert.match(page.data.err,/网络不可用/);
    failed=false; await page.retry();
    assert.equal(page.data.err,""); assert.equal(page.data.data.canPay,true);
  });

  it("reconfirms the original trade after WeChat succeeded but its confirmation request failed",async () => {
    let confirmed=false;
    const {page,calls}=harness({
      request:async (url) => {
        if(url==="/pay/confirm") { confirmed=true; return {data:{payStatus:"paid"}}; }
        return {data:url==="/me"?{walletBalance:200}:url==="/pay/for-enrollment"?{tradeNo:"wx-original",needPay:true}:fixture(confirmed?{payStatus:"paid",remainAmount:0,paidAmount:101,canPay:false}:{})};
      },
      confirm:async () => { throw Object.assign(new Error("确认请求超时"),{paymentPending:true,tradeNo:"wx-original"}); },
    });
    await page.load(); await page.charge("wechat");
    assert.equal(page.data.paymentPending,true); assert.equal(calls.toasts.length,0);
    await page.charge("wechat"); assert.equal(posts(calls).length,1);
    await page.retry();
    assert.equal(calls.requests.filter(([url])=>url==="/pay/confirm").length,1);
    assert.equal(page.data.paymentPending,false); assert.equal(page.data.ok,true);
    assert.equal(page.data.data.payStatus,"paid");
  });

  it("does not charge from a stale visible booking after refreshing it has failed",async () => {
    let failed=false;
    const {page,calls}=harness({request:async(url)=>{
      if(failed && url.startsWith("/pay/share/"))throw new Error("信息未更新");
      return {data:url==="/me"?{walletBalance:200}:fixture()};
    }});
    await page.load(); failed=true; await page.load();
    assert.equal(page.data.data.canPay,true); assert.ok(page.data.err);
    await page.charge("wallet"); assert.equal(posts(calls).length,0);
  });

  it("checks the ledger when a wallet charge succeeded but its response was lost",async () => {
    let settled=false;
    const {page,calls}=harness({request:async(url,method)=>{
      if(method==="POST") {settled=true;throw Object.assign(new Error("响应超时"),{networkError:true});}
      return {data:url==="/me"?{walletBalance:settled?180:200}:fixture(settled?{paidAmount:20,remainAmount:81}:{})};
    }});
    await page.load();mode(page,"split");amount(page,"20");await page.charge("wallet");
    assert.equal(posts(calls).length,1);assert.equal(page.data.ok,true);assert.equal(page.data.mode,"split");
    assert.equal(page.data.amount,"");assert.equal(page.data.data.remainAmount,81);
  });

  it("freezes ambiguous submission results but leaves an explicitly rejected payment retryable",async()=>{
    for(const uncertain of [true,false]) {
      const {page,calls}=harness({request:async(url,method)=>{
        if(method==="POST")throw Object.assign(new Error(uncertain?"响应超时":"余额不足"),uncertain?{networkError:true}:{status:400});
        return {data:url==="/me"?{walletBalance:200}:fixture()};
      }});
      await page.load();mode(page,"split");amount(page,"20");await page.charge("wallet");
      assert.equal(page.data.paymentPending,uncertain);
      if(uncertain) {await page.charge("wallet");assert.equal(posts(calls).length,1);}
      else assert.match(page.data.msg,/余额不足/);
    }
  });

  it("never publishes a previous account's delayed private booking result",async () => {
    const wait=deferred();
    const {page,app}=harness({request:(url) => url==="/me"?Promise.resolve({data:{id:1,walletBalance:200}}):wait.promise});
    const loading=page.load();
    await Promise.resolve(); await Promise.resolve();
    app.globalData.token="replacement-token";
    wait.resolve({data:fixture({travelerName:"旧账号实名"})});
    await loading;
    assert.ok(!page.data.data || page.data.data.travelerName!=="旧账号实名");
    assert.equal(page.data.refreshing,false);
  });

  it("does not mutate or toast after the payment page has been closed",async () => {
    const wait=deferred();
    const {page,calls}=harness({request:(url,method) => method==="POST"?wait.promise:Promise.resolve({data:url==="/me"?{walletBalance:200}:fixture()})});
    await page.load();
    const paying=page.charge("wallet");
    page.onUnload();
    wait.resolve({data:{payStatus:"paid"}});
    await paying;
    assert.equal(calls.toasts.length,0);
    assert.equal(calls.invoked.length,0);
  });

  it("blocks every non-payable enrollment state and identifies refunded orders",async () => {
    for (const patch of [{payStatus:"paid"},{payStatus:"refunded",cancelled:true},{company:true,payStatus:"company_pending"},{cancelled:true},{enrollmentStatus:"waitlist"},{enrollmentStatus:"applied",payStatus:"paid",payAmount:0,remainAmount:0}]) {
      const {page,calls}=harness({request:async (url) => ({data:url==="/me"?{walletBalance:200}:fixture({canPay:false,...patch})})});
      await page.load(); await page.charge("wallet");
      assert.equal(posts(calls).length,0);
      if(patch.payStatus==="refunded") assert.match(page.data.statusTitle,/退款/);
      if(patch.enrollmentStatus==="applied") assert.match(page.data.statusTitle,/抽签/);
    }
  });
});
