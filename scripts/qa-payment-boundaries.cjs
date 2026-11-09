#!/usr/bin/env node
// Positive payment/refund regressions. SQLite is isolated; every external provider is mocked.
const fs=require('node:fs'), os=require('node:os'), path=require('node:path'), https=require('node:https');
const assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const out=path.resolve(process.env.QA_ARTIFACT_DIR || fs.mkdtempSync(path.join(os.tmpdir(),'bj-payment-boundary-results-')));
fs.mkdirSync(out,{recursive:true});
const dir=fs.mkdtempSync(path.join(out,'data-'));
Object.assign(process.env,{
 NODE_ENV:'test',WX_PAY_MOCK:'1',WX_APPSECRET:'wx_demo_secret',
 WX_MCH_KEY:'',WX_MCH_CERT_PATH:'',WX_MCH_KEY_PATH:'',WX_MCH_CERT_PASS:'',
 ALIYUN_ACCESS_KEY_ID:'',ALIYUN_ACCESS_KEY_SECRET:'',TENCENT_SECRET_ID:'',TENCENT_SECRET_KEY:'',
 TENCENT_SMS_SDK_APP_ID:'',TENCENT_SMS_SIGN:'',TENCENT_SMS_TEMPLATE_ID:'',AI_API_KEY:'',OPENAI_API_KEY:'',
 ROUTE_I18N_AUTO:'0',AI_DISCOVERY_DAILY_LIMIT:'0',MMC_DATA_DIR:dir,MMC_DB_FILE:path.join(dir,'app.sqlite'),
 MMC_PUBLIC_DIR:path.join(dir,'public'),MMC_SKIP_WEB:'1',
});
const report={startedAt:new Date().toISOString(),database:process.env.MMC_DB_FILE,
 scope:'Company settlement and split-refund regressions, including mocked WeChat XML/signature protocol; no real merchant calls',
 externalAttempts:[],mockGatewayCalls:[],cases:[]};
const {createApp}=require(ROOT+'/server/src/app');
const {seedMinimal}=require(ROOT+'/server/test/helpers');
const config=require(ROOT+'/server/src/config'), wechat=require(ROOT+'/server/src/services/wechat');
const request=require(require.resolve('supertest',{paths:[ROOT+'/server']}));
const {refundEnrollmentToPayers}=require(ROOT+'/server/src/services/payment');
const {cancelEnrollment}=require(ROOT+'/server/src/services/enroll');
const auth=token=>({Authorization:'Bearer '+token});
const ids=['110101199205121219','110101199001011229'], realDateNow=Date.now;
global.fetch=async url=>{
 const href=String(url);
 if(href===wechat.UNIFIED_ORDER_URL){
  // Archive only the phase: signed XML bodies and JSAPI signatures are private.
  report.mockGatewayCalls.push({url:href,phase:'unifiedOrder'});
  return {text:async()=>wechat.objToXml({return_code:'SUCCESS',result_code:'SUCCESS',prepay_id:'qa_company_prepay'})};
 }
 if(href===wechat.ORDER_QUERY_URL){
  report.mockGatewayCalls.push({url:href,phase:'orderQuery'});
  return {text:async()=>wechat.objToXml({return_code:'SUCCESS',result_code:'SUCCESS',trade_state:'SUCCESS',transaction_id:'QA_COMPANY_TXN'})};
 }
 const parsed=new URL(href), safeUrl=parsed.origin+parsed.pathname;
 report.externalAttempts.push(safeUrl);throw new Error('QA forbids outbound fetch '+safeUrl);
};
https.request=options=>{
 const target=typeof options==='string'?new URL(options).origin:String(options?.hostname || 'unknown-host');
 report.externalAttempts.push(target);throw new Error('QA forbids outbound HTTPS '+target);
};
let seed,agent;
async function login(phone){
 const cap=await agent.get('/api/auth/captcha').expect(200), token=cap.body.data.token;
 const code=seed.db.prepare('SELECT code FROM captchas WHERE token=?').get(token).code;
 return (await agent.post('/api/auth/login').send({phone,password:'123456',captchaToken:token,captcha:code}).expect(200)).body.data.token;
}
async function enroll(token,sid,i=0){
 return (await agent.post('/api/enroll').set(auth(token)).send({scheduleId:sid,travelerName:'支付回归旅客'+i,
 travelerPhone:'13800138000',idCard:ids[i],emergencyName:'测试联系人',emergencyPhone:'13700000002',
 waiverAccepted:true,healthOk:true}).expect(200)).body.data;
}
function snapshot(sid){
 return {enrollments:seed.db.prepare('SELECT id,user_id,status,pay_status,pay_amount,pay_channel FROM enrollments WHERE schedule_id=? ORDER BY id').all(sid),
 payments:seed.db.prepare('SELECT id,user_id,enrollment_id,scene,status,channel,trade_no,amount,refunded_amount,refund_of,wechat_transaction_id,parent_payment_id FROM payments WHERE schedule_id=? ORDER BY id').all(sid)};
}
function companyLedger(state,count){
 const parents=state.payments.filter(p=>p.scene==='company'), children=state.payments.filter(p=>p.scene==='company_share');
 assert.equal(parents.length,1);assert.equal(children.length,count);
 const parent=parents[0];assert.equal(parent.status,'success');assert.equal(parent.user_id,seed.companyUserId);
 assert.equal(children.reduce((sum,p)=>sum+p.amount,0),parent.amount);
 assert.equal(new Set([parent,...children].map(p=>p.trade_no)).size,count+1);
 for(const child of children){
  assert.equal(child.status,'success');assert.equal(child.user_id,seed.companyUserId);
  assert.equal(child.parent_payment_id,parent.id);assert.equal(child.wechat_transaction_id || '',parent.wechat_transaction_id || '');
  const en=state.enrollments.find(e=>e.id===child.enrollment_id);
  assert.ok(en);assert.equal(en.pay_status,'paid');assert.equal(en.pay_amount,child.amount);
 }
 return {parent,children};
}
function refundLedger(before,after){
 const charges=before.payments.filter(p=>p.status==='success'&&!p.refund_of);
 const refunds=after.payments.filter(p=>p.status==='refunded'), total=charges.reduce((sum,p)=>sum+p.amount,0);
 assert.equal(charges.length,2);assert.equal(refunds.length,2);assert.equal(new Set(refunds.map(p=>p.trade_no)).size,2);
 assert.equal(refunds.reduce((sum,p)=>sum+p.amount,0),total);
 for(const charge of charges){
  assert.equal(after.payments.find(p=>p.id===charge.id).refunded_amount,charge.amount);
  assert.equal(refunds.filter(p=>p.refund_of===charge.id).reduce((sum,p)=>sum+p.amount,0),charge.amount);
 }
 return total;
}
async function splitPayment(){
 const user=await login('13800138000'), enrollment=await enroll(user,seed.individualScheduleId);
 await agent.post('/api/pay/for-enrollment').set(auth(user)).send({enrollmentId:enrollment.enrollmentId,amount:50}).expect(200);
 await new Promise(resolve=>setTimeout(resolve,3));
 await agent.post('/api/pay/for-enrollment').set(auth(user)).send({enrollmentId:enrollment.enrollmentId}).expect(200);
 return {user,enrollment,before:snapshot(seed.individualScheduleId)};
}
async function regression(name,fn){
 seed=seedMinimal();Object.assign(config.wechat,{mock:true,appSecret:'wx_demo_secret',mchKey:''});
 try{report.cases.push({name,status:'pass',evidence:await fn()});}
 catch(error){report.cases.push({name,status:'fail',error:error.message,stack:error.stack});}
 finally{Date.now=realDateNow;Object.assign(config.wechat,{mock:true,appSecret:'wx_demo_secret',mchKey:''});}
 console.log(report.cases.at(-1).status.toUpperCase(),name);
}
async function main(){
 const server=await new Promise(resolve=>{const s=createApp().listen(0,'127.0.0.1',()=>resolve(s));});agent=request(server);
 try{
  await regression('公司两人mock统一结算成功，父子流水唯一且金额一致',async()=>{
   const user=await login('13800138000'),company=await login('13900139000');
   await enroll(user,seed.companyScheduleId,0);await enroll(user,seed.companyScheduleId,1);
   const before=snapshot(seed.companyScheduleId);
   const r=await agent.post('/api/pay/company-settle').set(auth(company)).send({scheduleId:seed.companyScheduleId}).expect(200);
   const after=snapshot(seed.companyScheduleId), {parent}=companyLedger(after,2);
   assert.equal(r.body.data.count,2);assert.equal(r.body.data.total,parent.amount);assert.equal(r.body.data.needPay,false);
   await agent.post('/api/pay/company-settle').set(auth(company)).send({scheduleId:seed.companyScheduleId}).expect(400);
   assert.deepEqual(snapshot(seed.companyScheduleId),after);
   return {before,httpStatus:r.status,result:{count:2,total:parent.amount},after,repeatSettlementStatus:400};
  });
  await regression('公司两人真实协议mock通知成功，重复通知幂等且退款定位父商户单',async()=>{
   const user=await login('13800138000'),company=await login('13900139000');
   const enrollment=await enroll(user,seed.companyScheduleId,0);await enroll(user,seed.companyScheduleId,1);
   await agent.post('/api/auth/wechat').set(auth(company)).send({code:'qa_company_bind'}).expect(200);
   config.wechat.mock=false;config.wechat.mchKey='a'.repeat(32);
   const prepay=await agent.post('/api/pay/company-settle').set(auth(company)).send({scheduleId:seed.companyScheduleId}).expect(200);
   const tradeNo=prepay.body.data.tradeNo;assert.ok(tradeNo);assert.equal(prepay.body.data.needPay,true);
   const before=snapshot(seed.companyScheduleId);
   const body={return_code:'SUCCESS',result_code:'SUCCESS',mch_id:config.wechat.mchId,out_trade_no:tradeNo,transaction_id:'QA_COMPANY_TXN'};
   body.sign=wechat.signMd5(body,config.wechat.mchKey);
   const first=await agent.post('/api/pay/wechat/notify').set('content-type','text/xml').send(wechat.objToXml(body)).expect(200);
   const afterFirst=snapshot(seed.companyScheduleId), {parent,children}=companyLedger(afterFirst,2);
   assert.match(first.text,/SUCCESS/);assert.equal(parent.trade_no,tradeNo);assert.equal(parent.wechat_transaction_id,'QA_COMPANY_TXN');
   const retry=await agent.post('/api/pay/wechat/notify').set('content-type','text/xml').send(wechat.objToXml(body)).expect(200);
   const afterRetry=snapshot(seed.companyScheduleId);assert.match(retry.text,/SUCCESS/);assert.deepEqual(afterRetry,afterFirst);
   const confirmed=await agent.post('/api/pay/confirm').set(auth(company)).send({tradeNo}).expect(200);
   assert.equal(confirmed.body.data.already,true);assert.equal(confirmed.body.data.payStatus,'paid');
   const mockedRefundRequests=[];
   const cancelled=await cancelEnrollment(enrollment.enrollmentId,seed.userId,{refundWechat:async params=>{mockedRefundRequests.push(params);}});
   const child=children.find(p=>p.enrollment_id===enrollment.enrollmentId), refundRequest=mockedRefundRequests[0];
   assert.equal(mockedRefundRequests.length,1);assert.equal(refundRequest.tradeNo,parent.trade_no);
   assert.equal(refundRequest.transactionId,parent.wechat_transaction_id);
   assert.equal(refundRequest.totalFen,parent.amount*100);assert.equal(refundRequest.refundFen,child.amount*100);
   assert.equal(cancelled.refundAmount,child.amount);
   const afterRefund=snapshot(seed.companyScheduleId),refund=afterRefund.payments.find(p=>p.status==='refunded');
   assert.equal(refund.refund_of,child.id);assert.equal(refund.user_id,seed.companyUserId);
   return {scope:'真实支付XML/签名通知协议使用全mock网关；退款只注入provider，无商户连接',
   prepay:{tradeNo,needPay:true,count:prepay.body.data.count,total:prepay.body.data.total},
   before,firstNotify:first.text,afterFirst,retryNotify:retry.text,afterRetry,
   confirm:{already:confirmed.body.data.already,payStatus:confirmed.body.data.payStatus},mockedRefundRequests,afterRefund};
  });
  await regression('同付款人两笔分摊同毫秒退款成功，取消状态和退款账一致',async()=>{
   const {user,enrollment,before}=await splitPayment(),fixedMs=realDateNow();Date.now=()=>fixedMs;
   const r=await agent.post('/api/orders/'+enrollment.enrollmentId+'/cancel').set(auth(user)).expect(200);
   Date.now=realDateNow;const after=snapshot(seed.individualScheduleId),total=refundLedger(before,after);
   assert.equal(r.body.data.refundAmount,total);assert.equal(after.enrollments[0].status,'cancelled');
   assert.equal(after.enrollments[0].pay_status,'refunded');
   await agent.post('/api/orders/'+enrollment.enrollmentId+'/cancel').set(auth(user)).expect(400);
   assert.deepEqual(snapshot(seed.individualScheduleId),after);
   return {clockControl:'仅退款阶段冻结Date.now，两个退款slice在同毫秒生成',fixedMs,before,httpStatus:r.status,refundAmount:total,after,repeatCancellationStatus:400};
  });
  await regression('同毫秒退款provider使用不同退款号，重复执行保持幂等',async()=>{
   const {enrollment,before}=await splitPayment(),gateway=[],fixedMs=realDateNow();Date.now=()=>fixedMs;
   const total=before.payments.filter(p=>p.status==='success').reduce((sum,p)=>sum+p.amount,0);
   const current=()=>seed.db.prepare('SELECT * FROM enrollments WHERE id=?').get(enrollment.enrollmentId);
   const options={amount:total,remark:'QA mock external refund',refundWechat:async params=>{gateway.push(params);}};
   await refundEnrollmentToPayers(current(),options);
   const after=snapshot(seed.individualScheduleId);refundLedger(before,after);
   assert.equal(gateway.length,2);assert.notEqual(gateway[0].refundNo,gateway[1].refundNo);assert.notEqual(gateway[0].tradeNo,gateway[1].tradeNo);
   for(const call of gateway){const original=before.payments.find(p=>p.trade_no===call.tradeNo);assert.equal(call.totalFen,original.amount*100);assert.equal(call.refundFen,original.amount*100);}
   await refundEnrollmentToPayers(current(),options);assert.equal(gateway.length,2);assert.deepEqual(snapshot(seed.individualScheduleId),after);
   return {scope:'只注入退款provider；本case不执行报名取消，未验证真实网关行为',
   clockControl:'退款阶段Date.now冻结模拟同毫秒',fixedMs,before,mockedRefundRequests:gateway,after,repeatProviderCalls:0};
  });
 }finally{
  await new Promise(resolve=>server.close(resolve));report.finishedAt=new Date().toISOString();
  report.summary={cases:report.cases.length,passed:report.cases.filter(x=>x.status==='pass').length,failed:report.cases.filter(x=>x.status==='fail').length,externalAttempts:report.externalAttempts.length};
  fs.writeFileSync(path.join(out,'company-refund-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(report.summary);if(report.summary.failed || report.summary.externalAttempts)process.exitCode=1;
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
