const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function wishesCases({test,pageFor,goto,db,seed,origin,userToken,output}) {
  const {signUser} = require('../server/src/middleware/auth');
  const friendToken=signUser(db.prepare('SELECT * FROM users WHERE id=?').get(seed.companyUserId));
  const headers={authorization:'Bearer '+userToken,'content-type':'application/json'};
  async function create(body) {
    const response=await fetch(origin+'/api/wishes',{method:'POST',headers,body:JSON.stringify({idempotencyKey:'browser-wish-'+Date.now()+'-'+Math.random().toString(36).slice(2),kind:'drink',title:'周末的一杯咖啡',recipientName:'小林',note:'一起坐坐，聊聊最近的好事。',...body})});
    assert.equal(response.status,200,await response.clone().text());
    return (await response.json()).data;
  }
  async function friendPage() {
    const p=await pageFor('guest');
    await p.addInitScript(token=>localStorage.setItem('bj_token',token),friendToken);
    return p;
  }
  let sample;
  await test('wishes entry and creation make a free arrangement with no charge',async()=>{
    const p=await pageFor();
    try {
      await goto(p,'/m/activities');await p.locator('.activity-wish-entry').click();
      await p.waitForURL(url=>url.pathname==='/m/wishes');
      assert.equal(await p.locator('[data-wish-kind]').count(),7);
      await p.locator('[data-wish-kind=drink]').click();
      await p.waitForURL(url=>url.pathname==='/m/wishes/new');
      await p.locator('#wish-title').fill('周末请我喝杯咖啡');
      await p.locator('#wish-recipient').fill('小林');
      await p.locator('#wish-note').fill('约个有阳光的午后，好好聊聊天。');
      const paymentsBefore=db.prepare('SELECT COUNT(*) n FROM payments').get().n;
      await p.locator('.wish-create-submit').click();
      await p.locator('.wish-paper').waitFor();
      sample=new URL(p.url()).pathname.split('/').pop();
      assert.match(await p.locator('.wish-arrange-panel').innerText(),/无需付款/);
      assert.equal(await p.locator('.wish-pay').count(),0);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM payments').get().n,paymentsBefore);
      await p.screenshot({path:path.join(output,'wish-free-owner.png'),fullPage:true});
    } finally {await p.close();}
  });
  await test('a friend can claim, leave one blessing and mark an arrangement completed',async()=>{
    const wish=await create();const p=await friendPage();
    try {
      await goto(p,'/m/wishes/'+wish.token);
      await p.locator('.wish-claim').click();
      await p.locator('dialog.wish-confirm .wish-primary').click();
      await p.locator('.wish-complete').waitFor();
      await p.locator('.wish-blessing-input').fill('周六见，咖啡我来安排。');
      await p.locator('.wish-bless-submit').click();
      await p.locator('.wish-blessing').waitFor();
      assert.equal(await p.locator('.wish-bless-submit').count(),0);
      await p.screenshot({path:path.join(output,'wish-friend-claimed.png'),fullPage:true});
      await p.locator('.wish-complete').click();
      await p.locator('dialog.wish-confirm .wish-primary').click();
      await p.locator('.wish-ended-note').waitFor();
      assert.equal(db.prepare('SELECT status,claimed_by FROM wishes WHERE token=?').get(wish.token).status,'completed');
      assert.equal(await p.locator('.wish-complete').count(),0);
      await goto(p,'/m/wishes');await p.locator('[data-tab=joined]').click();
      await p.locator('.wish-list-card').first().waitFor();
    } finally {await p.close();}
  });
  await test('a linked wish opens the original split payment and preserves actual booking state when closed',async()=>{
    const token='wish-browser-order-'+Date.now();
    const id=Number(db.prepare("INSERT INTO enrollments(schedule_id,user_id,traveler_name,status,pay_status,pay_amount,pay_share_token,campus_snapshot_json) VALUES(?,?,?,'joined','unpaid',101,?,?)").run(seed.individualScheduleId,seed.userId,'林北野',token,JSON.stringify({studentPrice:false})).lastInsertRowid);
    const originalBalance=db.prepare('SELECT wallet_balance FROM users WHERE id=?').get(seed.companyUserId).wallet_balance;
    const wish=await create({kind:'trip',title:'下一程，一起出发',enrollmentId:id});
    const p=await friendPage();
    try {
      db.prepare('UPDATE users SET wallet_balance=500 WHERE id=?').run(seed.companyUserId);
      await goto(p,'/m/wishes/'+wish.token);await p.locator('.wish-pay').click();
      await p.waitForURL(url=>url.pathname==='/m/pay/'+token);
      assert.equal(new URL(p.url()).searchParams.get('mode'),'split');
      await p.locator('#pay-amount').fill('20');await p.locator('[data-channel=wallet]').click();await p.locator('.pay-submit').click();
      await p.locator('.pay-record').waitFor();
      assert.equal(db.prepare("SELECT amount FROM payments WHERE enrollment_id=? AND status='success'").get(id).amount,20);
      await goto(p,'/m/wishes/'+wish.token);await p.locator('.wish-order-panel').waitFor();
      assert.match(await p.locator('.wish-order-amount').innerText(),/81/);
      await p.screenshot({path:path.join(output,'wish-trip-partial.png'),fullPage:true});
      const owner=await pageFor();
      try {
        await goto(owner,'/m/wishes/'+wish.token);await owner.locator('.wish-close').click();
        assert.match(await owner.locator('dialog.wish-confirm').innerText(),/已有付款链接不受影响/);
        await owner.locator('dialog.wish-confirm .wish-primary').click();await owner.locator('.wish-ended-note').waitFor();
        assert.equal(db.prepare('SELECT status,pay_status FROM enrollments WHERE id=?').get(id).pay_status,'unpaid');
        assert.equal(db.prepare('SELECT status FROM wishes WHERE token=?').get(wish.token).status,'closed');
        const response=await fetch(origin+'/api/pay/share/'+token);assert.equal(response.status,200);
        assert.equal((await response.json()).data.remainAmount,81);
      } finally {await owner.close();}
    } finally {db.prepare('UPDATE users SET wallet_balance=? WHERE id=?').run(originalBalance,seed.companyUserId);await p.close();}
  });
  await test('wish share supports guests, recovers from a lost load and fits narrow, dark, English and large type views',async()=>{
    const wish=await create();
    const guest=await pageFor('guest');
    try {
      const endpoint='**/api/wishes/'+wish.token;
      await guest.route(endpoint,route=>route.abort('failed'));
      await goto(guest,'/m/wishes/'+wish.token);await guest.locator('.wish-retry').waitFor();
      await guest.unroute(endpoint);await guest.locator('.wish-retry').click();await guest.locator('.wish-claim').waitFor();
      await guest.locator('.wish-claim').click();await guest.waitForURL(url=>url.pathname==='/m/login');
      assert.equal(new URL(guest.url()).searchParams.get('redirect'),'/m/wishes/'+wish.token);
    } finally {await guest.close();}
    for(const [width,look] of [[320,{}],[390,{night:'dark'}],[390,{size:1.36}],[390,{lang:'en'}],[1440,{}]]) {
      const p=await pageFor('user',width,look);
      try {
        for(const [name,url,ready] of [['hub','/m/wishes','.wish-create-entry'],['new','/m/wishes/new?kind=trip','.wish-form'],['detail','/m/wishes/'+wish.token,'.wish-paper']]) {
          await goto(p,url);await p.locator(ready).first().waitFor();
          if(name==='detail' && look.night==='dark') {
            assert.equal(await p.locator('.wish-paper-footer strong').evaluate(node=>getComputedStyle(node).backgroundColor),'rgba(0, 0, 0, 0)');
          }
          assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} overflows ${width}/${JSON.stringify(look)}`);
          await p.screenshot({path:path.join(output,`wish-${name}-${width}-${look.night||look.lang||look.size||'day'}.png`),fullPage:true});
        }
      } finally {await p.close();}
    }
  });
  return sample;
};
