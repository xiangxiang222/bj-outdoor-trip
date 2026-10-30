const {describe,it}=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");

function adapter({sheetError,confirmError}={}) {
  const calls={sheets:[],confirm:[]};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,"../../miniprogram/utils/pay.js"),"utf8"),{
    module,
    require() {return {request:async(...args)=>{calls.confirm.push(args);if(confirmError)throw confirmError;return {data:{payStatus:"paid",amount:80,user:{walletBalance:30}}};}};},
    wx:{requestPayment(args) {calls.sheets.push(args);if(sheetError)args.fail(sheetError);else args.success({});}},
  });
  return {...module.exports,calls};
}
const order=()=>({tradeNo:"original-trade",needPay:true,amount:80,wechatPay:{timeStamp:123,nonceStr:"nonce",package:"prepay_id=one",paySign:"signed"}});
describe("native WeChat confirmation boundary",()=>{
  it("returns the authoritative confirmation after a successful payment sheet",async()=>{
    const {invokeWechatPay,calls}=adapter();
    const result=await invokeWechatPay(order());
    assert.equal(calls.sheets.length,1);assert.equal(calls.sheets[0].timeStamp,"123");
    assert.equal(calls.confirm[0][2].tradeNo,"original-trade");
    assert.equal(result.payStatus,"paid");assert.equal(result.needPay,false);assert.equal(result.user.walletBalance,30);
  });
  it("distinguishes a failed confirmation from a failed or cancelled charge",async()=>{
    const failure=new Error("确认请求超时");
    const {invokeWechatPay,calls}=adapter({confirmError:failure});
    await assert.rejects(invokeWechatPay(order()),(error)=>error===failure && error.paymentPending && error.tradeNo==="original-trade");
    assert.equal(calls.sheets.length,1);assert.equal(calls.confirm.length,1);
  });
  it("leaves a cancelled WeChat sheet retryable and never requests confirmation",async()=>{
    const {invokeWechatPay,calls}=adapter({sheetError:{errMsg:"requestPayment:fail cancel"}});
    await assert.rejects(invokeWechatPay(order()),(error)=>/已取消支付/.test(error.message) && !error.paymentPending);
    assert.equal(calls.confirm.length,0);
  });
  it("does not open a WeChat sheet for wallet or completed payments",async()=>{
    const {invokeWechatPay,calls}=adapter();
    const wallet={channel:"wallet",payStatus:"paid"};
    assert.equal(await invokeWechatPay(wallet),wallet);
    assert.equal(calls.sheets.length,0);assert.equal(calls.confirm.length,0);
  });
});
