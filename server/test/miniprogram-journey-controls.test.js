const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const view = require('../../miniprogram/utils/order-view');

function harness(name, request, sharedApp) {
  const filename = path.resolve(__dirname, '../../miniprogram/pages/' + name + '/' + name + '.js');
  const localRequire = createRequire(filename);
  const app = sharedApp || { globalData: { token:'account-a' } };
  let definition;
  const navigation = [];
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{
    getApp:()=>app, Page(value){definition=value;},
    require(id) {
      if(id.endsWith('/request')) return {request:request || (()=>Promise.resolve({data:[]})),setAuth(token,user){app.globalData.token=token;app.globalData.user=user;},showError(){}};
      if(id.endsWith('/appearance')) return {isDark:()=>false};
      return localRequire(id);
    },
    wx:{navigateTo(value){navigation.push(value.url);},showToast(){},setClipboardData(){},showModal(){}},
  },{filename});
  const page = {...definition,data:structuredClone(definition.data)};
  page.setData = function(patch) {
    for(const [key,value] of Object.entries(patch)) {
      const parts = key.split('.'); let node=this.data;
      for(const part of parts.slice(0,-1)) node=node[part] ||= {};
      node[parts.at(-1)]=value;
    }
  };
  return {page,app,navigation};
}
function event(key,value) { return {currentTarget:{dataset:{key}},detail:{value}}; }
function requestClient(app, respond) {
  const filename=path.resolve(__dirname,'../../miniprogram/utils/request.js');
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{
    module,getApp:()=>app,wx:{request:respond},
    require(id) {
      if(id==='./pulse') return {visitorId:()=> 'test-visitor'};
      if(id==='./appearance') return {read:()=>({lang:'zh'})};
      if(id==='./media') return {normalizeLegacyMedia:value=>value};
      throw new Error('Unexpected module '+id);
    },
  },{filename});
  return module.exports.request;
}
const rows = [
  {id:1,title:'山野',status:'joined',channel:'trip',schedule_status:'confirmed',pay_status:'paid',pay_amount:30,start_date:'2099-11-01',created_at:'2026-10-01'},
  {id:2,title:'牌局',status:'joined',channel:'activity',category:'掼蛋',pay_status:'unpaid',pay_amount:20,start_date:'2099-11-01',created_at:'2026-09-01'},
  {id:3,title:'旧牌局',status:'joined',channel:'activity',category:'掼蛋',pay_status:'paid',pay_amount:20,start_date:'2020-11-01',created_at:'2020-10-01',route_id:9},
];

describe('native journey filters and one-off activity navigation',()=>{
  it('shows all enrollment states by default and refreshes existing tabs after a new enrollment',async()=>{
    const app={globalData:{token:'account-a',user:{nickname:'报名人'}}};
    let current=[];
    const calls=[];
    const request=(path)=>{
      calls.push(path);
      return Promise.resolve({data:path==='/orders'?current:path==='/me/wallet'?{unpaidCount:current.filter(row=>row.pay_status==='unpaid').length,departCount:current.filter(row=>row.pay_status==='paid').length}:path==='/me'?app.globalData.user:[]});
    };
    const orders=harness('orders',request,app).page;
    const mine=harness('mine',request,app).page;
    await orders.onShow(); await mine.onShow();
    assert.equal(orders.data.tab,'all'); assert.equal(orders.data.shown.length,0);
    orders.setTab(event('ended'));
    orders.onHide(); mine.onHide();
    const enroll=requestClient(app,options=>{
      current=rows.slice(0,2);
      options.success({statusCode:200,data:{ok:true,data:{enrollmentId:2}}});
    });
    await enroll('/enroll','POST',{scheduleId:2});
    assert.equal(app.globalData.enrollmentRevision,1);
    await orders.onShow(); await mine.onShow();
    assert.equal(orders.data.tab,'all');
    assert.deepEqual(Array.from(orders.data.shown,row=>row.id),[1,2]);
    assert.equal(mine.data.hub.departCount,1); assert.equal(mine.data.hub.unpaidCount,1);
    assert.equal(calls.filter(path=>path==='/orders').length,2);
    assert.equal(calls.filter(path=>path==='/me/wallet').length,2);
  });
  it('starts a fresh tab request even while an earlier hidden-page request is unresolved',async()=>{
    const pending=[];
    const {page}=harness('orders',()=>new Promise(resolve=>pending.push(resolve)));
    const old=page.onShow(); page.onHide(); const fresh=page.onShow();
    assert.equal(pending.length,2);
    pending[1]({data:rows}); await fresh;
    pending[0]({data:[]}); await old;
    assert.equal(page.data.shown.length,3); assert.equal(page.data.loading,false);
  });
  it('marks enrollment data stale only after a successful enrollment response',async()=>{
    const app={globalData:{baseUrl:'https://example.test',token:'account-a'}};
    let response={statusCode:400,data:{ok:false,message:'报名未完成'}};
    const request=requestClient(app,options=>options.success(response));
    await assert.rejects(request('/enroll','POST',{}),/报名未完成/);
    assert.equal(app.globalData.enrollmentRevision,undefined);
    response={statusCode:200,data:{ok:true,data:{}}};
    await request('/orders');
    assert.equal(app.globalData.enrollmentRevision,undefined);
    await request('/enroll','POST',{});
    assert.equal(app.globalData.enrollmentRevision,1);
  });
  it('keeps explicit status links while a plain journey entry defaults to all',async()=>{
    const {page}=harness('orders',()=>Promise.resolve({data:rows}));
    page.onLoad({tab:'unpaid'}); await page.onShow();
    assert.equal(page.data.tab,'unpaid');
    assert.deepEqual(Array.from(page.data.shown,row=>row.id),[2]);
  });
  it('ignores stale account and hidden-page profile data while retaining the last successful wallet on refresh failure',async()=>{
    const pending=[];
    const {page,app}=harness('mine',(path)=>new Promise((resolve,reject)=>pending.push({path,resolve,reject})));
    const old=page.loadHub(); page.onHide(); app.globalData.token='account-b';
    const fresh=page.loadHub();
    pending[2].resolve({data:{unpaidCount:2}}); pending[3].resolve({data:{nickname:'新账号'}}); await fresh;
    pending[0].resolve({data:{unpaidCount:99}}); pending[1].resolve({data:{nickname:'旧账号'}}); await old;
    assert.equal(page.data.hub.unpaidCount,2); assert.equal(app.globalData.user.nickname,'新账号');
    const failed=page.loadHub(); pending[4].reject(new Error('offline')); pending[5].reject(new Error('offline')); await failed;
    assert.equal(page.data.hub.unpaidCount,2);
  });
  it('applies status immediately and preserves it when the sheet closes',()=>{
    const {page}=harness('orders'); page.setData({list:rows,tab:'all'}); page.paint(); page.openFilter();
    page.setDraftTab(event('unpaid'));
    assert.equal(page.data.tab,'unpaid');
    assert.deepEqual(Array.from(page.data.shown,row=>row.id),[2]);
    page.closeFilter(); page.openFilter();
    assert.equal(page.data.draftTab,'unpaid');
    page.setDraftTab(event('ended'));
    assert.deepEqual(Array.from(page.data.shown,row=>row.id),[3]);
  });
  it('applies custom dates immediately, preserves the last valid range on invalid edits, and clears it',()=>{
    const {page}=harness('orders'); page.setData({list:rows,tab:'all'}); page.paint(); page.openFilter();
    page.setStart(event('', '2026-10-01'));
    assert.deepEqual(Array.from(page.data.shown,row=>row.id),[1]);
    page.closeFilter(); assert.equal(page.data.start,'2026-10-01'); page.openFilter();
    page.setEnd(event('', '2026-09-01'));
    assert.equal(page.data.filterError,'起始时间不能晚于终止时间');
    assert.equal(page.data.end,'');
    page.applyFilter(); assert.equal(page.data.sheet,true);
    page.setEnd(event('', '2026-10-31')); page.applyFilter();
    assert.equal(page.data.sheet,false);
    assert.equal(page.data.end,'2026-10-31');
    page.clearTime(); assert.equal(page.data.shown.length,3); assert.equal(page.data.timeLabel,'');
  });
  it('resets status and time immediately without requiring the footer button',()=>{
    const {page}=harness('orders'); page.setData({list:rows,tab:'ended',preset:'2020'}); page.paint(); page.openFilter();
    page.resetDraft(); page.closeFilter();
    assert.equal(page.data.tab,'all'); assert.equal(page.data.preset,''); assert.equal(page.data.shown.length,3);
  });
  it('blocks direct handler attempts to reopen an activity as a route',()=>{
    const {page,navigation}=harness('orders'); page.setData({list:rows});
    page.goRoute({currentTarget:{dataset:{rid:9}}}); assert.deepEqual(navigation,[]);
    const detail=harness('enroll-order'); detail.page.setData({order:rows[2]}); detail.page.goRoute(); assert.deepEqual(detail.navigation,[]);
    detail.page.setData({order:{...rows[2],channel:'trip',schedule_status:'finished'}}); detail.page.goRoute(); assert.equal(detail.navigation.length,1);
  });
  it('loads activity semantics, uses remaining payment and masks private phone data',async()=>{
    const order={...rows[1],id:2,remainAmount:12,paidAmount:8,canPay:true,traveler_phone:'13812345678',seat_no:'1A'};
    const {page}=harness('enroll-order',()=>Promise.resolve({data:order})); page.setData({id:2}); await page.load();
    assert.equal(page.data.activity,true); assert.equal(page.data.icon,'cards'); assert.equal(page.data.amountText,'¥12'); assert.equal(page.data.phone,'138****5678'); assert.equal(page.data.again,false);
  });
  it('ignores a detail response after the account changes',async()=>{
    let resolve; const {page,app}=harness('enroll-order',()=>new Promise(done=>{resolve=done;})); page.setData({id:2});
    const pending=page.load(); app.globalData.token='account-b'; resolve({data:rows[1]}); await pending;
    assert.equal(page.data.order,null);
  });
  it('clears a displayed detail before loading the same order for a new account',async()=>{
    let resolve;
    const {page,app}=harness('enroll-order',()=>new Promise(done=>{resolve=done;}));
    page._account='account-a'; page.setData({id:2,order:{...rows[1],traveler_name:'账号甲'},reviewOpen:true,content:'旧评价'});
    app.globalData.token='account-b'; const loading=page.onShow();
    assert.equal(page.data.order,null); assert.equal(page.data.reviewOpen,false); assert.equal(page.data.content,'');
    resolve({data:{...rows[1],traveler_name:'账号乙'}}); await loading;
    assert.equal(page.data.order.traveler_name,'账号乙');
  });
  it('clears private detail before redirecting a signed-out user to login',()=>{
    const {page,app,navigation}=harness('enroll-order',()=>assert.fail('must not load after logout'));
    page._account='account-a'; page.setData({id:2,order:rows[1]}); app.globalData.token=''; page.onShow();
    assert.equal(page.data.order,null); assert.match(navigation[0],/^\/pages\/login\/login\?redirect=/);
  });
  it('ignores an old detail response after an A to B to A account round trip',async()=>{
    const pending=[]; const {page,app}=harness('enroll-order',()=>new Promise(resolve=>pending.push(resolve)));
    page._account='account-a'; page.setData({id:2}); const a=page.onShow(); app.globalData.token='account-b'; const b=page.onShow(); app.globalData.token='account-a'; const fresh=page.onShow();
    pending[0]({data:{...rows[1],traveler_name:'过时甲'}}); pending[1]({data:{...rows[1],traveler_name:'账号乙'}}); await a; await b;
    assert.equal(page.data.order,null); pending[2]({data:{...rows[1],traveler_name:'最新甲'}}); await fresh;
    assert.equal(page.data.order.traveler_name,'最新甲');
  });
});

describe('native order view semantics',()=>{
  it('does not count insurance twice when the trip itself is free',()=>{
    const price=view.priceLines({channel:'trip',pay_amount:5,insurance_fee:5});
    assert.equal(price.due,5);
    assert.deepEqual(price.lines,[{label:'团费',value:0,text:'免费'},{label:'保险',value:5,text:'¥5'}]);
    assert.equal(price.lines.reduce((sum,line)=>sum+line.value,0),price.due);
  });
  it('uses the right fallback icon for every activity type and never rebooks them',()=>{
    for(const [category,icon] of [['掼蛋','cards'],['跑步','run'],['电影','movie'],['招募','club']]) {
      const row={...rows[2],category}; assert.equal(view.orderIcon(row),icon); assert.equal(view.canReorder(row),false);
    }
    assert.equal(view.orderIcon({...rows[2],channel:'trip'}),'trip');
    assert.equal(view.canReorder({...rows[2],channel:'trip',schedule_status:'finished'}),true);
  });
  it('compares enrollment times by Beijing date and clamps month-end presets',()=>{
    const now=new Date('2026-12-31T17:00:00Z');
    assert.equal(view.orderTimePresets(now).years[0].key,'2026');
    assert.equal(view.matchOrderTime({created_at:'2027-01-01'}, {preset:'year'},now),true);
    const march=new Date('2026-03-31T04:00:00Z');
    assert.equal(view.matchOrderTime({created_at:'2026-02-28'}, {preset:'1m'},march),true);
    assert.equal(view.matchOrderTime({created_at:'2026-02-27'}, {preset:'1m'},march),false);
  });
});
