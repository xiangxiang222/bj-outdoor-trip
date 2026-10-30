const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function freeWish(patch={}) {
  return {token:'wish-token',kind:'drink',title:'请你喝杯喜欢的',recipientName:'小林',note:'周末见面吧',ownerName:'发起人',isOwner:false,isClaimant:false,claimedByName:'',claimStatus:null,status:'open',revision:1,createdAt:'2026-10-30T09:00:00.000Z',canClaim:true,canRelease:false,canComplete:false,canClose:false,canPay:false,canBless:true,order:null,blessings:[],paymentMode:'claim',...patch};
}
function tripWish(patch={}) {
  return freeWish({kind:'trip',paymentMode:'enrollment',canClaim:false,canPay:true,order:{title:'周末山野一日',startDate:'2026-11-01',payAmount:100,paidAmount:20,remainAmount:80,payStatus:'unpaid',enrollmentStatus:'joined',cancelled:false,canPay:true},...patch});
}
function harness(options={}) {
  const app={globalData:{token:options.anonymous?'':'account-a',user:{id:1}}};
  const calls={requests:[],navigation:[],modals:[],stopped:0};
  let definition;
  const filename=path.resolve(__dirname,'../../miniprogram/pages/wishes/wishes.js');
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{
    getApp:()=>app,Page(value){definition=value;},
    require(id){
      if(id.endsWith('/appearance')) return {isDark:()=>false};
      if(id.endsWith('/request')) return {request(...args){calls.requests.push(args);return options.request?options.request(...args):Promise.resolve({data:args[0]==='/wishes/meta'?{}:args[0].startsWith('/me/')?{items:[]}:freeWish()});}};
      throw new Error('Unexpected dependency '+id);
    },
    wx:{navigateTo(value){calls.navigation.push(value);},redirectTo(value){calls.navigation.push(value);if(options.redirectFails&&value.fail)value.fail();},showModal(value){calls.modals.push(value);if(options.confirm!==false)value.success({confirm:true});},stopPullDownRefresh(){calls.stopped++;}},
  },{filename});
  const page={...definition,data:structuredClone(definition.data)};
  page.setData=function(patch){Object.assign(this.data,patch);};
  page.onLoad(options.query||{token:'wish-token'});
  return {page,app,calls};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};}
function event(dataset={},value){return {currentTarget:{dataset},detail:{value}};}
const posts=(calls,tail)=>calls.requests.filter(([url,method])=>method==='POST'&&(!tail||url.endsWith(tail)));
function bookingEntry(order) {
  let definition;const navigation=[];
  const filename=path.resolve(__dirname,'../../miniprogram/pages/enroll-order/enroll-order.js');
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{
    getApp:()=>({globalData:{token:'account-a'}}),Page(value){definition=value;},require:()=>({}),
    wx:{navigateTo(value){navigation.push(value.url);}},
  },{filename});
  const page={...definition,data:{...structuredClone(definition.data),id:12,order}};
  return {page,navigation};
}


describe('native wishes',()=>{
  it('keeps anonymous templates available and preserves category or share token through login',async()=>{
    const {page,calls}=harness({anonymous:true,query:{}});
    await page.onShow();
    assert.equal(page.data.categories.length,7);
    assert.equal(calls.requests.some(([url])=>url.startsWith('/me/')),false);
    page.goNew(event({kind:'show'}));
    assert.equal(new URL(calls.navigation.at(-1).url,'https://test.invalid').searchParams.get('redirect'),'/pages/wishes/wishes?view=new&kind=show');
    const detail=harness({anonymous:true});
    detail.page.login();
    assert.equal(new URL(detail.calls.navigation[0].url,'https://test.invalid').searchParams.get('redirect'),'/pages/wishes/wishes?token=wish-token');
    assert.equal(detail.page.onShareAppMessage().path,'/pages/wishes/wishes');
  });

  it('validates title, recipient and note before creating a free wish, without any collection amount',async()=>{
    const {page,calls}=harness({query:{view:'new'}});
    page.setData({title:' ',recipientName:'长'.repeat(21),note:'长'.repeat(241)});
    await page.submitWish();
    assert.ok(page.data.errors.title&&page.data.errors.recipientName&&page.data.errors.note);
    assert.equal(posts(calls).length,0);
    page.setData({title:'一起喝一杯',recipientName:'小林',note:'周末见'});
    await page.submitWish();
    const body=posts(calls)[0][2];
    assert.equal(body.title,'一起喝一杯');
    assert.equal(body.kind,'drink');
    assert.deepEqual(Object.keys(body).sort(),['idempotencyKey','kind','note','recipientName','title']);
    assert.match(body.idempotencyKey,/^[A-Za-z0-9_-]{12,80}$/);
    assert.match(calls.navigation[0].url,/\?token=wish-token$/);
  });

  it('reuses a creation intent after uncertain network results and freezes that intent while retrying',async()=>{
    let attempts=0;
    const {page,calls}=harness({query:{view:'new'},request:async()=>{if(++attempts===1)throw Object.assign(new Error('timeout'),{networkError:true});return {data:freeWish()};}});
    page.setData({recipientName:'小林'});
    await page.submitWish();
    assert.equal(page.data.createUncertain,true);
    page.onField(event({field:'title'},'不能偷换新心愿'));
    const first=posts(calls)[0][2];
    await page.submitWish();
    assert.equal(posts(calls)[1][2].idempotencyKey,first.idempotencyKey);
    assert.equal(posts(calls)[1][2].title,first.title);
    assert.equal(page.data.createUncertain,false);
  });

  it('blocks rapid repeat submission while the first creation is in flight',async()=>{
    const wait=deferred();
    const {page,calls}=harness({query:{view:'new'},request:()=>wait.promise});
    page.setData({recipientName:'小林'});
    const first=page.submitWish();
    await page.submitWish();
    assert.equal(posts(calls).length,1);
    wait.resolve({data:freeWish()});await first;
    assert.equal(page.data.busy,false);
  });

  it('shows the created detail even when native redirect fails, rather than inviting a duplicate creation',async()=>{
    const {page}=harness({query:{view:'new'},redirectFails:true});
    page.setData({recipientName:'小林'});
    await page.submitWish();
    assert.equal(page.data.view,'detail');
    assert.equal(page.data.wish.token,'wish-token');
    assert.equal(page.data.busy,false);
  });

  it('preselects only an eligible own real order and leaves its masked recipient authoritative',async()=>{
    const order={enrollmentId:12,title:'周末山野',startDate:'2026-11-01',recipientName:'林*',payAmount:100,paidAmount:20,remainAmount:80};
    const {page,calls}=harness({query:{view:'new',kind:'trip',enrollmentId:'12'},request:async(url)=>({data:url==='/me/wish-orders'?{items:[order]}:tripWish()})});
    await page.onShow();
    assert.equal(page.data.selectedOrder.recipientName,'林*');
    assert.equal(page.data.linkOrder,true);
    page.onField(event({field:'recipientName'},'伪造的人'));
    await page.submitWish();
    const body=posts(calls)[0][2];
    assert.equal(body.enrollmentId,12);
    assert.equal(body.recipientName,'');
    assert.equal(body.kind,'trip');
  });

  it('does not silently convert a failed order load into an empty list or an unlinked wish',async()=>{
    const {page,calls}=harness({query:{view:'new',kind:'trip'},request:async()=>{throw new Error('订单接口失败');}});
    await page.toggleOrder(event({},true));
    assert.match(page.data.ordersError,/订单接口失败/);
    assert.equal(page.data.ordersReady,false);
    await page.submitWish();
    assert.match(page.data.errors.enrollmentId,/请选择/);
    assert.equal(posts(calls).length,0);
  });

  it('permits a trip category as a free wish when no actual order is linked',async()=>{
    const {page,calls}=harness({query:{view:'new',kind:'trip'}});
    page.setData({recipientName:'小林'});await page.submitWish();
    assert.equal(posts(calls)[0][2].kind,'trip');
    assert.equal(Object.hasOwn(posts(calls)[0][2],'enrollmentId'),false);
  });

  it('allows a free wish for oneself without collecting another name',async()=>{
    const {page,calls}=harness({query:{view:'new'}});
    await page.submitWish();
    assert.equal(posts(calls).length,1);
    assert.equal(posts(calls)[0][2].recipientName,'');
    assert.equal(page.data.errors.recipientName,undefined);
  });

  it('claims once with the displayed revision and refuses owner or already claimed actions',async()=>{
    const wait=deferred();
    const {page,calls}=harness({request:(url,method)=>method==='POST'?wait.promise:Promise.resolve({data:freeWish()})});
    await page.loadWish();
    const claim=page.claimWish();await page.claimWish();
    assert.equal(posts(calls,'/claim').length,1);
    assert.equal(posts(calls,'/claim')[0][2].revision,1);
    wait.resolve({data:freeWish({revision:2,canClaim:false,canRelease:true,isClaimant:true,claimedByName:'我',claimStatus:'claimed'})});await claim;
    assert.equal(page.data.wish.claimStatus,'claimed');
    await page.claimWish();
    assert.equal(posts(calls,'/claim').length,1);
    page.setData({wish:freeWish({isOwner:true,canClaim:false})});await page.claimWish();
    assert.equal(posts(calls,'/claim').length,1);
  });

  it('refreshes a revision conflict without automatically repeating the claim',async()=>{
    let reads=0;
    const {page,calls}=harness({request:async(url,method)=>{if(method==='POST')throw Object.assign(new Error('conflict'),{status:409});return {data:freeWish(++reads>1?{revision:2,canClaim:false,claimStatus:'claimed',claimedByName:'另一位朋友'}:{})};}});
    await page.loadWish();await page.claimWish();
    assert.equal(posts(calls,'/claim').length,1);
    assert.equal(page.data.wish.revision,2);
    assert.match(page.data.actionError,/新进展/);
    assert.equal(page.data.busy,false);
  });

  it('requires confirmation for returning and completing an arrangement, and uses the current revision',async()=>{
    const {page,calls}=harness({request:async(url,method)=>({data:freeWish({revision:method?3:2,isClaimant:true,canClaim:false,canRelease:true,canComplete:true,claimStatus:'claimed'})})});
    await page.loadWish();page.releaseClaim();await tick();
    assert.match(calls.modals[0].content,/其他朋友/);
    const release=calls.requests.find(([url,method])=>url.endsWith('/claim')&&method==='DELETE');
    assert.equal(release[2].revision,2);
    page.completeWish();await tick();
    assert.match(calls.modals[1].content,/不会下单或付款/);
    assert.equal(posts(calls,'/complete')[0][2].revision,3);
  });

  it('does not mutate when a confirmation is cancelled and describes closing linked orders honestly',async()=>{
    const {page,calls}=harness({confirm:false});
    page.setData({wish:tripWish({isOwner:true,canClose:true})});
    page.closeWish();await tick();
    assert.match(calls.modals[0].content,/不会取消原行程订单或退款/);
    assert.match(calls.modals[0].content,/付款链接仍有效/);
    assert.equal(posts(calls).length,0);
  });

  it('never routes a free wish to payment and uses the original real order pay token for split payment',async()=>{
    const {page,calls}=harness({request:async()=>({data:{token:'original-pay-token',mode:'split'}})});
    page.setData({wish:freeWish()});await page.goPayment();
    assert.equal(calls.requests.length,0);assert.equal(calls.navigation.length,0);
    page.setData({wish:tripWish()});await page.goPayment();
    assert.equal(calls.requests[0][0],'/wishes/wish-token/payment');
    assert.equal(calls.navigation[0].url,'/pages/pay/pay?token=original-pay-token&mode=split');
  });

  it('distinguishes paid booking from wish completion and preserves share identity',async()=>{
    const paid=tripWish({canPay:false,order:{title:'周末山野',payAmount:100,paidAmount:100,remainAmount:0,payStatus:'paid'}});
    const {page}=harness({request:async()=>({data:paid})});
    await page.loadWish();
    assert.equal(page.data.wish.stateLabel,'团费已付清');
    assert.equal(page.data.wish.status,'open');
    assert.equal(page.onShareAppMessage().path,'/pages/wishes/wishes?token=wish-token');
  });

  it('retries an uncertain blessing with the same intent and does not allow another blessing after success',async()=>{
    let attempts=0;
    const {page,calls}=harness({request:async(url,method)=>{
      if(!method)return {data:freeWish()};
      if(++attempts===1)throw Object.assign(new Error('timeout'),{networkError:true});
      return {data:freeWish({canBless:false,hasBlessed:true,blessings:[{id:1,self:true,nickname:'我',message:'愿你开心',createdAt:'2026-10-30'}]})};
    }});
    await page.loadWish();page.onBlessing(event({},'愿你开心'));await page.sendBlessing();
    assert.equal(page.data.blessUncertain,true);page.onBlessing(event({},'偷换祝福'));
    await page.sendBlessing();
    assert.equal(posts(calls,'/bless')[0][2].idempotencyKey,posts(calls,'/bless')[1][2].idempotencyKey);
    assert.equal(posts(calls,'/bless')[1][2].message,'愿你开心');
    assert.equal(page.data.wish.alreadyBlessed,true);assert.equal(page.data.blessing,'');
    await page.sendBlessing();assert.equal(posts(calls,'/bless').length,2);
  });

  it('retains a retryable error after detail failure and stops pull-down refresh',async()=>{
    const {page,calls}=harness({request:async()=>{throw new Error('网络失败');}});
    await page.onPullDownRefresh();
    assert.equal(page.data.ready,true);assert.equal(page.data.refreshing,false);
    assert.match(page.data.error,/网络失败/);assert.equal(calls.stopped,1);
  });

  it('ignores an unloaded response and a response for a changed share token',async()=>{
    const old=deferred();
    const {page}=harness({request:()=>old.promise});
    const pending=page.loadWish();page.onUnload();old.resolve({data:freeWish()});await pending;
    assert.equal(page.data.wish,null);
    const changed=deferred();
    const b=harness({request:()=>changed.promise});
    const result=b.page.loadWish();b.page.setData({token:'different'});changed.resolve({data:freeWish()});await result;
    assert.equal(b.page.data.wish,null);
  });

  it('does not expose another account’s records when a pending hub request completes after account switching',async()=>{
    const wait=deferred();let first=true;
    const {page,app}=harness({query:{},request:(url)=>{
      if(url==='/wishes/meta')return Promise.resolve({data:{}});
      if(first){first=false;return wait.promise;}
      return Promise.resolve({data:{items:[]}});
    }});
    const old=page.onShow();app.globalData.token='account-b';await page.onShow();
    wait.resolve({data:{items:[freeWish({title:'A的私密记录'})]}});await old;
    assert.equal(page.data.items.length,0);assert.equal(page.data.refreshing,false);
  });

  it('clears form and rejects a pending mutation response after account switching',async()=>{
    const wait=deferred();
    const {page,app,calls}=harness({query:{view:'new'},request:()=>wait.promise});
    page.setData({title:'A的私密心愿',recipientName:'A的朋友',note:'私密留言'});
    const pending=page.submitWish();app.globalData.token='account-b';await page.onShow();
    wait.resolve({data:freeWish()});await pending;
    assert.notEqual(page.data.title,'A的私密心愿');assert.equal(page.data.recipientName,'');assert.equal(page.data.note,'');
    assert.equal(calls.navigation.length,0);assert.equal(page.data.busy,false);
  });

  it('invalidates a previously opened confirmation across an A to B to A account round trip',async()=>{
    const {page,app,calls}=harness({confirm:false});
    page.setData({wish:freeWish({isOwner:true,canClose:true})});page.closeWish();
    const oldConfirm=calls.modals[0];
    app.globalData.token='account-b';await page.onShow();app.globalData.token='account-a';await page.onShow();
    oldConfirm.success({confirm:true});await tick();
    assert.equal(posts(calls).length,0);
  });

  it('does not discard existing rows on pagination failure and deduplicates successful continuation',async()=>{
    let moreFails=true;
    const {page}=harness({query:{},request:async(url)=>{
      if(url==='/wishes/meta')return {data:{}};
      if(url.includes('cursor=')){if(moreFails)throw new Error('下一页失败');return {data:{items:[freeWish(),freeWish({token:'second'})],hasMore:false}};}
      return {data:{items:[freeWish()],hasMore:true,nextCursor:'10'}};
    }});
    await page.onShow();await page.loadMore();assert.equal(page.data.items.length,1);assert.match(page.data.listError,/下一页失败/);
    moreFails=false;await page.loadMore();assert.equal(page.data.items.length,2);assert.equal(page.data.hasMore,false);
  });

  it('opens an existing travel wish even after it is paid or closed, instead of trying to create a duplicate',()=>{
    for(const canPay of [true,false]){
      const {page,navigation}=bookingEntry({canPay,wishToken:'original-wish-token'});
      page.goWish();
      assert.equal(navigation[0],'/pages/wishes/wishes?token=original-wish-token');
    }
  });

  it('only starts a new linked travel wish when the server still allows that booking',()=>{
    const payable=bookingEntry({canPay:true,canLinkWish:true});payable.page.goWish();
    assert.equal(payable.navigation[0],'/pages/wishes/wishes?view=new&kind=trip&enrollmentId=12');
    const stillPayable=bookingEntry({canPay:true,canLinkWish:false});stillPayable.page.goWish();
    assert.equal(stillPayable.navigation.length,0);
    const unavailable=bookingEntry({canPay:false,canLinkWish:false});unavailable.page.goWish();
    assert.equal(unavailable.navigation.length,0);
  });
  it('shows wish and blessing dates in Beijing time without shifting calendar trip dates',async()=>{
    const createdAt='2026-10-30T16:30:00.000Z';
    const {page}=harness({request:async()=>({data:tripWish({createdAt,blessings:[{id:3,nickname:'甲',self:false,message:'早',createdAt}]})})});
    await page.onShow();
    assert.equal(page.data.wish.dateLabel,'2026.10.31');
    assert.equal(page.data.wish.blessings[0].dateLabel,'2026.10.31');
    assert.equal(page.data.wish.order.dateLabel,'2026.11.01');
  });
});
