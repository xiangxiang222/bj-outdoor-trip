#!/usr/bin/env node
// Isolated defect probes. An observed result records a reproduced defect or policy; it is not acceptance success.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const out = path.resolve(process.env.QA_ARTIFACT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'bj-trip-boundary-results-')));
fs.mkdirSync(out, { recursive: true });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bj-qa-boundaries-'));
Object.assign(process.env, {
  NODE_ENV: 'test', WX_PAY_MOCK: '1', WX_APPSECRET: 'wx_demo_secret',
  ALIYUN_ACCESS_KEY_ID: '', ALIYUN_ACCESS_KEY_SECRET: '',
  TENCENT_SECRET_ID: '', TENCENT_SECRET_KEY: '', TENCENT_SMS_SDK_APP_ID: '',
  TENCENT_SMS_SIGN: '', TENCENT_SMS_TEMPLATE_ID: '', AI_API_KEY: '', OPENAI_API_KEY: '',
  ROUTE_I18N_AUTO: '0', MMC_DATA_DIR: dir, MMC_DB_FILE: path.join(dir, 'app.sqlite'),
  MMC_PUBLIC_DIR: path.join(dir, 'public'), MMC_SKIP_WEB: '1',
});
const externalAttempts = [];
global.fetch = async (url) => { externalAttempts.push(String(url)); throw new Error('QA blocks all outbound fetch: '+url); };
const { createApp } = require(ROOT+'/server/src/app');
const { seedMinimal } = require(ROOT+'/server/test/helpers');
const { signGuide } = require(ROOT+'/server/src/middleware/auth');
const request = require(require.resolve('supertest', { paths:[ROOT+'/server'] }));
const auth = token => ({ Authorization:'Bearer '+token });
const ID = '110101199205121219';
const today = new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const report = { database:process.env.MMC_DB_FILE, externalAttempts, cases:[] };
let seed, agent, serial=0;
async function captcha() {
  const response=await agent.get('/api/auth/captcha').expect(200);
  const token=response.body.data.token;
  return {captchaToken:token,captcha:seed.db.prepare('SELECT code FROM captchas WHERE token=?').get(token).code};
}
async function register() {
  const phone='1355500'+String(++serial).padStart(4,'0');
  const r=await agent.post('/api/auth/register').send({phone,password:'123456',nickname:'边界测试'+serial,...await captcha()}).expect(200);
  return {token:r.body.data.token,phone,id:r.body.data.user.id};
}
async function login(phone='13800138000') {
  const r=await agent.post('/api/auth/login').send({phone,password:'123456',...await captcha()}).expect(200);
  return r.body.data.token;
}
async function admin() {
  return (await agent.post('/api/admin/login').send({username:'admin',password:'admin123'}).expect(200)).body.data.token;
}
async function enrollment(token, scheduleId=seed.individualScheduleId, extra={}) {
  return agent.post('/api/enroll').set(auth(token)).send({scheduleId,travelerName:'边界游客',travelerPhone:'13800138000',idCard:ID,emergencyName:'测试联系人',emergencyPhone:'13700000002',waiverAccepted:true,healthOk:true,...extra});
}
async function run(name, fn) {
  seed=seedMinimal();
  const t=Date.now();
  try { const evidence=await fn();report.cases.push({name,status:'pass',ms:Date.now()-t,evidence}); }
  catch(e) {report.cases.push({name,status:'fail',ms:Date.now()-t,error:e.message,stack:e.stack});}
  console.log(report.cases.at(-1).status,name);
}
async function observe(name, fn) {
  await run(name,fn);
  report.cases.at(-1).kind='policy-observation';
  if (report.cases.at(-1).status==='pass') report.cases.at(-1).status='observed';
}
async function main() {
  const server=await new Promise(resolve=>{const s=createApp().listen(0,'127.0.0.1',()=>resolve(s));});
  agent=request(server);
  try {
    await run('未登录不能发团或访问导游/后台接口',async()=>{
      const codes=[];
      for(const [method,url] of [['post','/api/trips'],['post','/api/schedules'],['get','/api/guide/schedules'],['get','/api/admin/schedules']])codes.push((await agent[method](url)).status);
      assert.deepEqual(codes,[401,401,401,401]);return {codes};
    });
    await observe('新普通账号填公司/学校名称能发已审批线路排期',async()=>{
      const user=await register();const outputs=[];
      for(const organizerType of ['company','campus']) {
        const r=await agent.post('/api/schedules').set(auth(user.token)).send({routeId:seed.routeId,startDate:'2099-12-01',busTypeId:'coaster10',organizerType,companyName:organizerType==='company'?'边界测试企业':'北京大学'}).expect(200);
        outputs.push({type:r.body.data.organizerType,reviewStatus:r.body.data.reviewStatus,status:r.body.data.status});
      }
      const profile=seed.db.prepare('SELECT role,id_verified,student_status,group_status FROM users WHERE id=?').get(user.id);
      return {profile,outputs,interpretation:'现有规则仅校验名称；不是认证拒绝路径，不应报告为认证通过'};
    });
    await observe('新普通账号发布高校/公司新线路仍进入审核',async()=>{
      const user=await register();const outputs=[];
      for(const organizerType of ['company','campus']){
        const r=await agent.post('/api/trips').set(auth(user.token)).send({title:'边界'+organizerType,startDate:'2099-12-01',busTypeId:'coaster10',organizerType,companyName:organizerType==='company'?'边界测试企业':'北京大学',originPrice:100,minGroupSize:2}).expect(200);
        assert.equal(r.body.data.reviewStatus,'pending');outputs.push({type:r.body.data.organizerType,reviewStatus:r.body.data.reviewStatus});
      }
      return outputs;
    });
    await run('非公司员工可报公开公司团，但不能代公司结算',async()=>{
      const user=await register();const joined=await enrollment(user.token,seed.companyScheduleId,{travelerPhone:user.phone});
      assert.equal(joined.status,200);assert.equal(joined.body.data.payStatus,'company_pending');
      const settle=await agent.post('/api/pay/company-settle').set(auth(user.token)).send({scheduleId:seed.companyScheduleId});assert.equal(settle.status,403);
      return {enrollStatus:joined.status,payStatus:joined.body.data.payStatus,outsiderSettlement:settle.status,interpretation:'公司不查员工认证；公开报名按当前规则允许，结算按发起人权限拦截'};
    });
    await run('未达学校资格的游客不能报受限高校团',async()=>{
      const user=await register();const a=await admin();
      await agent.put('/api/admin/schedules/'+seed.individualScheduleId+'/limit').set(auth(a)).send({studentOnly:true,schools:['北京大学']}).expect(200);
      const r=await enrollment(user.token);assert.equal(r.status,400);return {status:r.status,message:r.body.message};
    });
    await run('未分配导游无法读名单/开团/签到/完成',async()=>{
      const guide=seed.db.prepare('SELECT * FROM guides WHERE id=?').get(seed.guideId);const token=signGuide(guide);const codes=[];
      for(const [method,suffix] of [['get',''],['post','/start'],['post','/checkins'],['post','/checkin'],['post','/complete']])codes.push((await agent[method]('/api/guide/schedules/'+seed.companyScheduleId+suffix).set(auth(token)).send({})).status);
      assert.deepEqual(codes,[404,404,404,404,404]);return {codes};
    });
    await run('未来日期已成团不可提前开团',async()=>{
      const a=await admin();seed.db.prepare("UPDATE schedules SET status='confirmed' WHERE id=?").run(seed.individualScheduleId);
      const r=await agent.post('/api/admin/schedules/'+seed.individualScheduleId+'/start').set(auth(a));assert.equal(r.status,400);return {status:r.status,message:r.body.message};
    });
    await observe('出发当天未成团却可经后台正式开团',async()=>{
      const a=await admin();seed.db.prepare("UPDATE schedules SET start_date=?,end_date=?,status='recruiting' WHERE id=?").run(today,today,seed.individualScheduleId);
      const count=seed.db.prepare("SELECT COUNT(*) n FROM enrollments WHERE schedule_id=? AND status='joined'").get(seed.individualScheduleId).n;
      const r=await agent.post('/api/admin/schedules/'+seed.individualScheduleId+'/start').set(auth(a));assert.equal(r.status,200);assert.ok(r.body.data.startedAt);
      return {status:r.status,realEnrolled:count,minGroup:2,startedAt:r.body.data.startedAt,interpretation:'startTrip仅校验出发日期，未校验成团状态或人数，需产品确认是否允许后台强开'};
    });
    await observe('出发当天未开始可直接完成行程，完成后仍可新建签到',async()=>{
      const a=await admin();seed.db.prepare('UPDATE schedules SET start_date=?,end_date=?,guide_id=? WHERE id=?').run(today,today,seed.guideId,seed.individualScheduleId);
      const complete=await agent.post('/api/admin/schedules/'+seed.individualScheduleId+'/complete').set(auth(a));assert.equal(complete.status,200);
      const guide=seed.db.prepare('SELECT * FROM guides WHERE id=?').get(seed.guideId);
      const checkin=await agent.post('/api/guide/schedules/'+seed.individualScheduleId+'/checkins').set(auth(signGuide(guide))).send({stopKey:'depart'});assert.equal(checkin.status,200);
      return {completeStatus:complete.status,startedBeforeComplete:seed.db.prepare('SELECT started_at FROM schedules WHERE id=?').get(seed.individualScheduleId).started_at,checkinAfterCompletionStatus:checkin.status,interpretation:'completeSchedule不要求started_at，openCheckin未拦completed_at；完成后仍可写入签到轮次，状态边界待修'};
    });
    await run('mock付款重复请求不重复收款或积分',async()=>{
      const token=await login();const en=await enrollment(token);assert.equal(en.status,200);const id=en.body.data.enrollmentId;
      const first=await agent.post('/api/pay/for-enrollment').set(auth(token)).send({enrollmentId:id}).expect(200);
      const before=seed.db.prepare('SELECT points FROM users WHERE id=?').get(seed.userId).points;
      const again=await agent.post('/api/pay/for-enrollment').set(auth(token)).send({enrollmentId:id});assert.equal(again.status,400);
      const after=seed.db.prepare('SELECT points FROM users WHERE id=?').get(seed.userId).points;assert.equal(before,after);
      const count=seed.db.prepare("SELECT COUNT(*) n FROM payments WHERE enrollment_id=? AND status='success'").get(id).n;assert.equal(count,1);
      return {amount:first.body.data.amount,repeatStatus:again.status,pointsBefore:before,pointsAfter:after,successPaymentRows:count};
    });
    await run('已付款取消重复请求只退款一次，取消后不能再付款',async()=>{
      const token=await login();const en=await enrollment(token);assert.equal(en.status,200);const id=en.body.data.enrollmentId;
      await agent.post('/api/pay/for-enrollment').set(auth(token)).send({enrollmentId:id}).expect(200);
      await agent.post('/api/orders/'+id+'/cancel').set(auth(token)).expect(200);
      const again=await agent.post('/api/orders/'+id+'/cancel').set(auth(token));
      const pay=await agent.post('/api/pay/for-enrollment').set(auth(token)).send({enrollmentId:id});assert.equal(pay.status,400);
      const count=seed.db.prepare("SELECT COUNT(*) n FROM payments WHERE enrollment_id=? AND status='refunded'").get(id).n;assert.equal(count,1);
      return {repeatCancelStatus:again.status,cancelledPaymentStatus:pay.status,refundRows:count};
    });
    await observe('mock-success可被其他用户调用，已退款支付流水可重新置为success',async()=>{
      const token=await login();const outsider=await register();const en=await enrollment(token);const id=en.body.data.enrollmentId;
      const paid=await agent.post('/api/pay/for-enrollment').set(auth(token)).send({enrollmentId:id}).expect(200);
      await agent.post('/api/orders/'+id+'/cancel').set(auth(token)).expect(200);
      const refund=seed.db.prepare("SELECT id,trade_no,status FROM payments WHERE enrollment_id=? AND status='refunded'").get(id);
      const r=await agent.post('/api/pay/mock-success').set(auth(outsider.token)).send({tradeNo:refund.trade_no});assert.equal(r.status,200);
      const after=seed.db.prepare('SELECT id,status,amount,refund_of FROM payments WHERE id=?').get(refund.id);assert.equal(after.status,'success');
      return {outsiderStatus:r.status,before:refund,after,interpretation:'仅非生产mock端点缺权限/状态检查；生产有403保护，真实支付不受此端点影响。测试不应将此路径当可信支付回调'};
    });
    assert.equal(externalAttempts.length,0);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    report.summary={total:report.cases.length,passed:report.cases.filter(x=>x.status==='pass').length,failed:report.cases.filter(x=>x.status==='fail').length,observations:report.cases.filter(x=>x.kind==='policy-observation').length};
    fs.writeFileSync(path.join(out,'boundary-report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(report.summary);
    if(report.summary.failed)process.exitCode=1;
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
