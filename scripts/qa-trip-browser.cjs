#!/usr/bin/env node
// Reproducible browser QA against a newly created temporary database only.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const output = process.env.QA_ARTIFACT_DIR ? path.resolve(process.env.QA_ARTIFACT_DIR) : fs.mkdtempSync(path.join(os.tmpdir(), 'bj-qa-browser-artifacts-'));
fs.mkdirSync(output, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bj-qa-browser-'));
Object.assign(process.env, { NODE_ENV:'test', MMC_DATA_DIR:dataDir, MMC_DB_FILE:path.join(dataDir,'app.sqlite'), MMC_PUBLIC_DIR:path.join(dataDir,'public'), MMC_WEB_DIST_DIR:path.join(root,'web/dist'), MMC_SKIP_WEB:'0', WX_PAY_MOCK:'1', WX_APPSECRET:'wx_demo_secret', ROUTE_I18N_AUTO:'0', AI_DISCOVERY_DAILY_LIMIT:'0' });
for (const key of ['ALIYUN_ACCESS_KEY_ID','ALIYUN_ACCESS_KEY_SECRET','TENCENT_SECRET_ID','TENCENT_SECRET_KEY','TENCENT_SMS_SDK_APP_ID','TENCENT_SMS_SIGN','TENCENT_SMS_TEMPLATE_ID','AI_API_KEY','OPENAI_API_KEY','WX_MCH_KEY','WX_TPL_MERGE']) process.env[key] = '';
const report = { date:new Date(Date.now()+8*3600000).toISOString().slice(0,10), timezone:'Asia/Shanghai', startedAt:new Date().toISOString(), scope:'Chromium mobile H5 user, admin and guide interfaces; isolated API assistance explicitly recorded', output, dataDir, mock:{ payment:true, sms:true, identityProvider:'not invoked', weather:'unavailable', externalNetwork:'blocked in browser' }, accounts:[], cases:[], errors:[], screenshots:[], apiAssist:[], findings:[], layoutChecks:[] };
const privateState = { accounts:report.accounts, actors:{} };
let browser, listener, db, base;
const todayChina = () => new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const futureChina = (days=7) => new Date(Date.now()+days*86400000+8*3600000).toISOString().slice(0,10);
function publicReplacer(key,value) {
 if (/password|token|idcard|jwt|authorization/i.test(key)) return undefined;
 if (typeof value !== 'string') return value;
 return value.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[REDACTED JWT]')
  .replace(/\b\d{17}[\dXx]\b/g,'[REDACTED ID]')
  .replace(/("(?:password|\w*token|idcard|jwt|authorization)"\s*:\s*)"[^"]*"/gi,'$1"[REDACTED]"');
}
function saveReport() {
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,publicReplacer,2));
 fs.writeFileSync(path.join(output,'accounts.json'),JSON.stringify(report.accounts,publicReplacer,2));
 const privateFile=path.join(output,'state.private.json');
 fs.writeFileSync(privateFile,JSON.stringify({...privateState,origin:base,database:process.env.MMC_DB_FILE},null,2),{mode:0o600});
 fs.chmodSync(privateFile,0o600);
}
async function api(method,url,body,token) {
 const res = await fetch(base+'/api'+url,{ method, headers:{'content-type':'application/json', ...(token?{authorization:'Bearer '+token}:{})}, body:body===undefined?undefined:JSON.stringify(body)});
 const json=await res.json(); assert.equal(res.status,200,method+' '+url+': '+JSON.stringify(json)); return json.data;
}
async function capture(page,name) { const layout=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));report.layoutChecks.push({name,...layout});assert.ok(layout.scrollWidth<=layout.viewport+1,'Horizontal overflow on '+name);const file=path.join(output,name+'.png'); await page.screenshot({path:file,fullPage:true}); report.screenshots.push(file); }
async function test(name,fn) { const t=Date.now();try { const evidence=await fn(); report.cases.push({name,status:'pass',ms:Date.now()-t,evidence}); console.log('PASS '+name); } catch(e) { report.cases.push({name,status:'fail',ms:Date.now()-t,error:e.stack}); console.error('FAIL '+name+': '+e.message); } saveReport(); }
async function newPage(values={},width=390) {
 const p=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});p.setDefaultTimeout(7000);
 p.on('pageerror',e=>report.errors.push({url:p.url(),error:e.message})); p.on('dialog',d=>d.accept());
 await p.addInitScript(values=>{for(const [k,v] of Object.entries(values))localStorage.setItem(k,v);localStorage.setItem('bj_look',JSON.stringify({night:'day',size:1,lang:'zh'}));},values);
 await p.route('**/*', route=> { const u=new URL(route.request().url()); if(u.protocol==='data:'||u.protocol==='blob:'||u.origin===base) return route.continue();return route.abort('blockedbyclient'); });
 await p.route('**/api/weather?**',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,message:'QA offline weather'})}));return p;
}
async function goto(p,url) {await p.goto(base+url,{waitUntil:'domcontentloaded'}); await p.waitForFunction(()=>document.querySelector('#app')?.textContent?.trim().length>10);}
function userValues(a) {return {bj_token:a.token,bj_user:JSON.stringify(a.user)};}
async function registerUi(phone,nickname) {
 const p=await newPage(); await goto(p,'/m/login?tab=register');
 await p.getByPlaceholder('怎么称呼你').fill(nickname);await p.getByPlaceholder('11 位手机号',{exact:true}).fill(phone);
 const sent=p.waitForResponse(r=>r.url().endsWith('/api/auth/sms')&&r.request().method()==='POST');await p.getByRole('button',{name:'获取验证码',exact:true}).click();const sms=await sent;assert.equal(sms.status(),200,await sms.text());
 await p.getByPlaceholder('6 位短信验证码').fill('888888'); await p.getByPlaceholder('至少 6 位').fill('Qa123456');await p.getByPlaceholder('再输入一次密码').fill('Qa123456');
 const posted=p.waitForResponse(r=>r.url().endsWith('/api/auth/register')&&r.request().method()==='POST');await p.getByRole('button',{name:'注册',exact:true}).click();const r=await posted;assert.equal(r.status(),200,await r.text());const a=(await r.json()).data;
 await p.waitForURL(u=>u.pathname==='/m/mine');await capture(p,'registered-'+phone.slice(-2));await p.close(); report.accounts.push({id:a.user.id,phone,nickname,method:'browser SMS registration',password:'Qa123456'});return a;
}
async function registerApi(phone,nickname) {await api('POST','/auth/sms',{phone,scene:'register'});const a=await api('POST','/auth/register',{phone,nickname,password:'Qa123456',smsCode:'888888'}); report.accounts.push({id:a.user.id,phone,nickname,method:'API registration fixture',password:'Qa123456'});return a;}
async function approveStudent(a,adminToken) {
 await api('POST','/me/student',{school:'北京大学',college:'信息科学技术学院',studentNo:'20260000'+a.user.id,studentCardUrl:'/static/uploads/qa-student-card.jpg'},a.token);
 const rev=db.prepare('SELECT student_revision FROM users WHERE id=?').get(a.user.id).student_revision;
 await api('POST',`/admin/users/${a.user.id}/verify`,{kind:'student',revision:rev,action:'approve'},adminToken);a.user=await api('GET','/me',undefined,a.token); report.apiAssist.push({action:'campus certification submitted and approved through APIs',userId:a.user.id});
}
async function main() {
 assert.ok(fs.existsSync(path.join(root,'web/dist/index.html')),'Run npm run build first');
 const {seedMinimal}=require('../server/test/helpers'); const seed=seedMinimal();db=seed.db;
 const {createApp}=require('../server/src/app');const app=createApp();
 const express=require(require.resolve('express',{paths:[path.join(root,'server')]})); app.use('/static',express.static(path.join(root,'server/public/static')));
 listener=await new Promise(res=>{const s=app.listen(0,'127.0.0.1',()=>res(s));});base=`http://127.0.0.1:${listener.address().port}`;report.base=base;
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const admin=await api('POST','/admin/login',{username:'admin',password:'admin123'});
 privateState.adminToken=admin.token;
 const actors=privateState.actors; const branch={};
 for (const [i,key,label] of [[1,'individual','大众发起人'],[2,'campus','高校发起人'],[3,'company','公司发起人']]) await test(`UI registers ${label} with mock SMS`,async()=>{actors[key]=await registerUi('1987000010'+i,'QA'+label);return {userId:actors[key].user.id};});
 for(const [i,key] of [[4,'first'],[5,'second']]) await test('API prepares newly registered participant '+key,async()=>{actors[key]=await registerApi('1987000010'+i,'QA报名人'+i);await approveStudent(actors[key],admin.token);return {userId:actors[key].user.id};});
 if(actors.campus) await test('API certifies the registered campus publisher',async()=>{await approveStudent(actors.campus,admin.token);return {userId:actors.campus.user.id};});
 for(const [key,label] of [['individual','大众'],['campus','高校'],['company','公司']]) {
  await test(`${label} trip is published through all four mobile form steps`,async()=>{
   assert.ok(actors[key],key+' publisher unavailable');const p=await newPage(userValues(actors[key]));try {
    await goto(p,'/m/publish?type='+key);await p.locator('#publish-route').selectOption(String(seed.routeId));await p.locator('#publish-date').fill(futureChina());await p.getByRole('button',{name:/下一步/}).click();
    if(key==='company')await p.locator('#publish-company').fill('QA隔离企业有限公司');
    if(key==='campus') {assert.equal(await p.locator('.campus-pick-btn').first().innerText(),'北京大学');assert.match(await p.locator('.audience-preview').innerText(),/北京大学/);}
    await capture(p,'publish-'+key+'-audience');await p.getByRole('button',{name:/下一步/}).click();await p.locator('#publish-bus').selectOption('coaster10');await p.locator('#publish-min').fill('2');await p.locator('#publish-meetup-time').fill('07:30');await p.getByRole('button',{name:/下一步/}).click();
    await capture(p,'publish-'+key+'-review');const saved=p.waitForResponse(r=>r.url().endsWith('/api/schedules')&&r.request().method()==='POST');await p.getByRole('button',{name:'发布并邀请同行',exact:true}).click();const r=await saved;assert.equal(r.status(),200,await r.text());const s=(await r.json()).data;branch[key]={id:s.id,publisher:actors[key].user.id,enrollments:[]};await p.waitForURL(u=>u.pathname==='/m/schedule/'+s.id);await capture(p,'published-'+key);assert.equal(s.organizerType,key);assert.equal(s.reviewStatus,'approved');return {scheduleId:s.id,reviewStatus:s.reviewStatus,note:'Existing /schedules product flow automatically approves known-route departures; no admin approval button is required.'};
   }finally{await p.close();}
  });
  for(const who of ['first','second']) await test(`${label} trip ${who} participant enrolls using mobile form`,async()=>{
   assert.ok(branch[key],key+' trip unavailable');const a=actors[who];assert.ok(a,who+' unavailable');const p=await newPage(userValues(a),who==='first'?375:390);try {
    await goto(p,'/m/enroll/'+branch[key].id);await p.getByPlaceholder('与身份证一致').fill('QA报名人'+(who==='first'?'甲':'乙'));await p.getByPlaceholder('接收集合通知').fill(a.user.phone);await p.getByPlaceholder('18位身份证号，末位数字或X').fill(who==='first'?'110101199205121219':'110101199001011229');await p.getByPlaceholder('家人或同伴姓名').fill('QA紧急联系人');await p.getByPlaceholder('不能与出行人同一号码').fill('13700000002');await p.locator('input[type=radio][value=none]').check();await p.locator('input[type=checkbox]').nth(0).check();await p.locator('input[type=checkbox]').nth(1).check();await capture(p,'enroll-'+key+'-'+who);
    const saved=p.waitForResponse(r=>r.url().endsWith('/api/enroll')&&r.request().method()==='POST');await p.getByRole('button',{name:'加入报名（暂不付款）',exact:true}).click();const r=await saved;assert.equal(r.status(),200,await r.text());const en=(await r.json()).data;branch[key].enrollments.push({id:en.enrollmentId,userId:a.user.id});assert.equal(en.status,'joined');return {enrollmentId:en.enrollmentId,payStatus:en.payStatus,viewport:who==='first'?375:390};
   }finally{await p.close();}
  });
  await test(`${label} trip forms and mock payment is recorded`,async()=>{
   const b=branch[key];assert.ok(b&&b.enrollments.length===2,'two UI enrollments required');let paid;
   if(key==='company') {const p=await newPage(userValues(actors.company));try {await goto(p,'/m/schedule/'+b.id);const payment=p.waitForResponse(r=>r.url().endsWith('/api/pay/company-settle')&&r.request().method()==='POST');await p.getByRole('button',{name:'公司统一微信支付',exact:true}).click();const response=await payment;const responseBody=await response.json();await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await capture(p,'company-settlement-result');if(response.status()!==200){report.findings.push({id:'company-settlement-500',request:{method:'POST',path:'/api/pay/company-settle',body:{scheduleId:b.id}},response:{status:response.status(),body:responseBody},enrollments:db.prepare('SELECT id,status,pay_status,pay_amount FROM enrollments WHERE schedule_id=?').all(b.id),payments:db.prepare('SELECT id,enrollment_id,amount,status,trade_no,scene FROM payments WHERE schedule_id=?').all(b.id),indexes:db.prepare("SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name='payments'").all(),uiVisibleFailure:await p.locator('body').innerText().then(text=>text.includes('UNIQUE constraint')||text.includes('支付失败')),screenshot:path.join(output,'company-settlement-result.png')});}assert.equal(response.status(),200,JSON.stringify(responseBody));paid=responseBody.data;assert.equal(paid.mock,true);}finally{await p.close();}}
   else {for(const en of b.enrollments) paid=await api('POST','/pay/for-enrollment',{enrollmentId:en.id},actors.first.token);}
   const s=await api('GET','/schedules/'+b.id);assert.equal(s.status,'confirmed');assert.ok(s.guide?.id);assert.equal(s.enrolled,2);b.guideId=s.guide.id;
   for(const en of b.enrollments) assert.equal(db.prepare('SELECT pay_status FROM enrollments WHERE id=?').get(en.id).pay_status,'paid');report.apiAssist.push({action:'mock payment through actual service API',branch:key,scheduleId:b.id});return {scheduleId:b.id,status:s.status,guideId:s.guide.id,paidCount:b.enrollments.length,companyTotal:paid.total};
  });
 }
 await test('Uncertified account is blocked from campus enrollment in the UI',async()=>{const p=await newPage(userValues(actors.individual),375);try{await goto(p,'/m/enroll/'+branch.campus.id);const button=p.getByRole('button',{name:'暂不符合报名条件',exact:true});await button.waitFor();assert.equal(await button.isDisabled(),true);await capture(p,'campus-ineligible-account');return {accountId:actors.individual.user.id,scheduleId:branch.campus.id,disabled:true};}finally{await p.close();}});
 await test('Admin logs in through browser and sees all three groups',async()=>{
  const p=await newPage({},1100);try{await goto(p,'/admin/login');await p.locator('input').nth(0).fill('admin');await p.locator('input[type=password]').fill('admin123');await p.getByRole('button',{name:/登录/}).click();await p.waitForURL(u=>u.pathname!=='/admin/login');await goto(p,'/admin/schedules');await p.locator('.el-table__body-wrapper').waitFor();await capture(p,'admin-groups');const body=await p.locator('body').innerText();assert.match(body,/QA隔离企业有限公司/);return {visibleGroups:Object.values(branch).map(x=>x.id)};}finally{await p.close();}
 });
 let guidePage;
 await test('Guide logs in through captcha and mock SMS form',async()=>{
  guidePage=await newPage({},390);await goto(guidePage,'/g/login');await guidePage.locator('#guide-phone').fill('13700001101');await guidePage.locator('.guide-captcha-button img').waitFor();const captcha=db.prepare('SELECT code FROM captchas ORDER BY created_at DESC,rowid DESC LIMIT 1').get();await guidePage.locator('#guide-captcha').fill(captcha.code);const sent=guidePage.waitForResponse(r=>r.url().endsWith('/api/auth/sms')&&r.request().method()==='POST');await guidePage.getByRole('button',{name:'获取验证码',exact:true}).click();assert.equal((await sent).status(),200);await guidePage.locator('#guide-sms').fill('888888');await guidePage.getByRole('button',{name:'进入工作台',exact:true}).click();await guidePage.waitForURL(u=>u.pathname==='/g');await capture(guidePage,'guide-home');return {phone:'13700001101',method:'UI captcha + mock SMS'};
 });
 for(const [key,label] of [['individual','大众'],['campus','高校'],['company','公司']]) await test(`Guide operates ${label} roster, departure, two check-in rounds and completion`,async()=>{
  const b=branch[key];assert.ok(b,'group missing');const live=await api('GET','/schedules/'+b.id);b.guideId=live.guide?.id;assert.ok(b.guideId,'assigned guide missing');assert.ok(guidePage,'guide login missing');const p=guidePage;
  await goto(p,'/g/schedule/'+b.id);await p.locator('.guide-roster').waitFor();assert.equal(await p.locator('.traveler-name').count(),2);assert.equal(await p.getByRole('button',{name:'正式开团',exact:true}).isDisabled(),true);assert.equal(await p.locator('.guide-roster a.tel-link').count(),0);await capture(p,'guide-'+key+'-masked');
  db.prepare('UPDATE schedules SET start_date=?,end_date=? WHERE id=?').run(todayChina(),todayChina(),b.id);report.apiAssist.push({action:'isolated clock fixture: move departure date to China today to avoid waiting seven days',scheduleId:b.id});await p.reload();await p.getByRole('button',{name:'正式开团',exact:true}).click();await p.waitForFunction(()=>[...document.querySelectorAll('.guide-roster a.tel-link')].length>=2);await capture(p,'guide-'+key+'-started');
  for(let round=0;round<2;round++){if(round)await p.locator('#guide-stop').selectOption('stop-0');await p.getByRole('button',{name:'发起签到',exact:true}).click();await p.getByRole('button',{name:'核对并结束本轮签到',exact:true}).waitFor();for(const name of ['QA报名人甲','QA报名人乙']){await p.getByRole('button',{name:name+'签到',exact:true}).click();await p.getByRole('button',{name:name+'已签到，撤销签到',exact:true}).waitFor();}await p.getByRole('button',{name:'核对并结束本轮签到',exact:true}).click();await p.getByRole('button',{name:'发起签到',exact:true}).waitFor();}
  await capture(p,'guide-'+key+'-checkins');await p.getByRole('button',{name:'结束行程',exact:true}).click();await p.locator('.guide-finish-note').waitFor();await capture(p,'guide-'+key+'-completed');assert.ok(db.prepare('SELECT completed_at FROM schedules WHERE id=?').get(b.id).completed_at);assert.equal(db.prepare("SELECT COUNT(*) n FROM checkin_sessions WHERE schedule_id=? AND status='confirmed'").get(b.id).n,2);const paymentState=db.prepare('SELECT DISTINCT pay_status FROM enrollments WHERE schedule_id=?').all(b.id);const companyPaid=paymentState.length>0&&paymentState.every(row=>row.pay_status==='paid');return {scheduleId:b.id,roster:2,confirmedRounds:2,completed:true,paymentState,note:key==='company'?(companyPaid?'Company mock payment and guide lifecycle passed.':'Guide functions independently verified; company payment remains incomplete ('+paymentState.map(row=>row.pay_status).join(', ')+'); full company lifecycle has NOT passed.'):undefined};
 });
 if(guidePage)await guidePage.close();report.branch=branch;report.lifecycleConclusion={individual:'passed including mocked payment',campus:'passed including verified-campus enrollment and mocked payment',company:report.findings.some(x=>x.id==='company-settlement-500')?'blocked at payment; later guide steps tested independently':'passed'};report.summary={pass:report.cases.filter(c=>c.status==='pass').length,fail:report.cases.filter(c=>c.status==='fail').length,pageErrors:report.errors.length};saveReport();assert.equal(report.summary.fail,0,'Browser QA contains failures');assert.equal(report.errors.length,0,'Browser JS errors');
}
main().catch(e=>{report.fatal=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{saveReport();if(browser)await browser.close();if(listener)await new Promise(r=>listener.close(r));if(db)db.close();console.log('QA_REPORT '+path.join(output,'report.json'));});
