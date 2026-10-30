const assert = require("node:assert/strict");
const path = require("node:path");

// Real local wallet transactions use the caller's disposable database. WeChat
// presentation is exercised with metadata stubs; this never charges real money.
module.exports = async function paymentCases({ test, pageFor, goto, db, seed, origin, userToken, output }) {
  const { signUser } = require("../server/src/middleware/auth");
  const ownerBefore=db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.userId).wallet_balance;
  const helperBefore=db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.companyUserId).wallet_balance;
  const created=[];
  const fixture=(patch={}) => {
    const token="browser-pay-"+created.length;
    const id=Number(db.prepare("INSERT INTO enrollments(schedule_id,user_id,traveler_name,status,pay_status,pay_amount,pay_share_token,campus_snapshot_json) VALUES (?,?,?,?,?,?,?,?)")
      .run(seed.individualScheduleId,seed.userId,"林北野",patch.status||"joined",patch.payStatus||"unpaid",patch.total??101,token,JSON.stringify({studentPrice:false})).lastInsertRowid);
    created.push(id);
    return {id,token};
  };
  async function visit(order,options={}) {
    db.prepare("UPDATE users SET wallet_balance=500 WHERE id IN (?,?)").run(seed.userId,seed.companyUserId);
    const p=await pageFor(options.helper?"guest":"user",options.width||390,options.look||{});
    if(options.helper) {
      const user=db.prepare("SELECT * FROM users WHERE id=?").get(seed.companyUserId);
      const token=signUser(user);
      await p.addInitScript((value)=>localStorage.setItem("bj_token",value),token);
    }
    await goto(p,"/m/pay/"+order.token+(options.split?"?mode=split":""));
    await p.locator(".pay-page").waitFor();
    if(!options.terminal)await p.locator(".pay-mode[data-mode=self]").first().waitFor();
    return p;
  }
  const stored=(order)=>db.prepare("SELECT pay_status FROM enrollments WHERE id=?").get(order.id);
  const rows=(order)=>db.prepare("SELECT user_id,amount,channel,status FROM payments WHERE enrollment_id=? AND status='success' ORDER BY id").all(order.id);
  async function select(p,mode) { await p.locator(`[data-mode="${mode}"]`).click(); }
  async function wallet(p) { await p.locator('[data-channel="wallet"]').click(); }
  async function submit(p) { await p.locator(".pay-submit").click(); }

  try {
    await test("fee payment offers three clear choices and owner wallet payment settles the actual order",async()=>{
      const order=fixture(); const p=await visit(order);
      try {
        assert.equal(await p.locator("[data-mode]").count(),3);
        await wallet(p); await submit(p);
        await p.getByText("团费已付清",{exact:true}).first().waitFor();
        assert.equal(stored(order).pay_status,"paid");
        assert.deepEqual(rows(order),[{user_id:seed.userId,amount:101,channel:"wallet",status:"success"}]);
        assert.equal(await p.locator(".pay-page .pay-submit").count(),0);
        assert.equal(await p.locator(".pay-record").count(),1);
        await p.screenshot({path:path.join(output,"payment-paid.png"),fullPage:true});
      } finally {await p.close();}
    });

    await test("contribution stays on the same booking, records both payers and settles only after the remainder",async()=>{
      const order=fixture(); let p=await visit(order);
      try {
        await select(p,"split");
        assert.equal(await p.locator("#pay-amount").inputValue(),"");
        await p.locator("#pay-amount").fill("40");
        await wallet(p); await submit(p);
        await p.waitForFunction(()=>document.querySelector(".pay-record")?.textContent.includes("40"));
        assert.equal(stored(order).pay_status,"unpaid");
        assert.equal(await p.locator("[data-mode=split]").getAttribute("aria-pressed"),"true");
        assert.equal(await p.locator("#pay-amount").inputValue(),"");
        assert.equal(await p.locator(".pay-record").count(),1);
        await p.screenshot({path:path.join(output,"payment-partial-owner.png"),fullPage:true});
      } finally {await p.close();}
      p=await visit(order,{helper:true,split:true});
      try {
        assert.equal(await p.locator("[data-mode]").count(),2);
        assert.equal(await p.locator("#pay-amount").inputValue(),"");
        await select(p,"self");
        await wallet(p); await submit(p);
        await p.getByText("团费已付清",{exact:true}).first().waitFor();
        assert.equal(stored(order).pay_status,"paid");
        assert.deepEqual(rows(order),[
          {user_id:seed.userId,amount:40,channel:"wallet",status:"success"},
          {user_id:seed.companyUserId,amount:61,channel:"wallet",status:"success"},
        ]);
        assert.equal(await p.locator(".pay-record").count(),2);
        assert.doesNotMatch(await p.locator(".pay-page").innerText(),/众筹/);
        await p.screenshot({path:path.join(output,"payment-helper-complete.png"),fullPage:true});
      } finally {await p.close();}
    });

    await test("friend can pay the full remainder without becoming another traveler",async()=>{
      const order=fixture(); const p=await visit(order,{helper:true});
      try {
        assert.match(await p.locator("[data-mode=self]").innerText(),/代付剩余/);
        await wallet(p); await submit(p);
        await p.getByText("团费已付清",{exact:true}).first().waitFor();
        assert.equal(rows(order)[0].user_id,seed.companyUserId);
        assert.equal(rows(order)[0].amount,101);
        assert.equal(db.prepare("SELECT user_id FROM enrollments WHERE id=?").get(order.id).user_id,seed.userId);
      } finally {await p.close();}
    });

    await test("invalid contributions create no charge and repeated clicks create exactly one charge",async()=>{
      const order=fixture(); const p=await visit(order,{split:true}); let posts=0;
      p.on("request",(r)=>{if(new URL(r.url()).pathname==="/api/pay/for-enrollment"&&r.method()==="POST")posts++;});
      try {
        for(const value of ["","-1","1.5","102"]) {
          await p.locator("#pay-amount").fill(value);
          await submit(p);
          assert.ok(await p.locator("[role=alert]").count(),"invalid input has an explanation: "+value);
        }
        assert.equal(posts,0);
        await p.locator("#pay-amount").fill("20"); await wallet(p);
        await p.route("**/api/pay/for-enrollment",async(route)=>{
          await new Promise((resolve)=>setTimeout(resolve,150)); await route.continue();
        });
        await p.locator(".pay-submit").evaluate((button)=>{button.click();button.click();});
        await p.locator(".pay-record").waitFor();
        assert.equal(posts,1);
        assert.equal(rows(order).length,1);
        assert.equal(rows(order)[0].amount,20);
      } finally {await p.close();}
    });

    await test("web WeChat payment directs to the mini program without reserving an unusable prepayment",async()=>{
      const order=fixture();
      const p=await pageFor(); let posts=0;
      await p.route("**/api/meta",(route)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,data:{wechatPayMock:false,wechatPayLive:true}})}));
      p.on("request",(r)=>{if(new URL(r.url()).pathname==="/api/pay/for-enrollment"&&r.method()==="POST")posts++;});
      try {
        await goto(p,"/m/pay/"+order.token);
        await p.locator(".pay-submit").waitFor(); await submit(p);
        await p.getByText("请打开微信小程序「同行者众」完成支付",{exact:true}).first().waitFor();
        assert.equal(posts,0);
        assert.equal(rows(order).length,0);
      } finally {await p.close();}
    });

    await test("inviting a friend shares the chosen payment mode without creating a charge",async()=>{
      const order=fixture(); const p=await visit(order);
      try {
        await p.evaluate(()=>{window.paymentShares=[];Object.defineProperty(navigator,"share",{configurable:true,value:async(value)=>window.paymentShares.push(value)});});
        await select(p,"proxy"); await submit(p);
        let shared=await p.evaluate(()=>window.paymentShares);
        assert.equal(shared.length,1);assert.equal(new URL(shared[0].url).pathname,"/m/pay/"+order.token);
        assert.equal(new URL(shared[0].url).search,"");
        await select(p,"split"); await p.locator(".pay-share-link").click();
        shared=await p.evaluate(()=>window.paymentShares);
        assert.equal(shared.length,2);assert.equal(new URL(shared[1].url).searchParams.get("mode"),"split");
        assert.equal(rows(order).length,0);
      } finally {await p.close();}
    });

    await test("a pending payment remains frozen until refreshing verifies the same booking ledger",async()=>{
      const order=fixture(); const p=await visit(order,{split:true});
      let posted=0;
      await p.route("**/api/pay/for-enrollment",(route)=>{posted++;return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,data:{amount:20,payStatus:"unpaid",needPay:false,channel:"wallet"}})});});
      try {
        await p.locator("#pay-amount").fill("20");await wallet(p);await submit(p);
        await p.getByText("正在确认支付结果，请勿重复付款",{exact:true}).waitFor();
        assert.equal(await p.locator(".pay-submit").isDisabled(),true);
        assert.equal(await p.locator("[data-mode=self]").isDisabled(),true);
        await p.getByRole("button",{name:"刷新结果",exact:true}).click();
        await p.getByRole("button",{name:"刷新结果",exact:true}).waitFor();
        assert.equal(await p.locator(".pay-submit").isDisabled(),true);
        assert.equal(posted,1);
        db.prepare("INSERT INTO payments(enrollment_id,user_id,schedule_id,amount,channel,status,scene,remark) VALUES(?,?,?,20,'wallet','success','enrollment','自己支付（分摊）')").run(order.id,seed.userId,seed.individualScheduleId);
        await p.getByRole("button",{name:"刷新结果",exact:true}).click();
        await p.getByText("本次付款已到账",{exact:true}).waitFor();
        assert.equal(await p.locator(".pay-submit").isDisabled(),false);
        assert.equal(posted,1);
      } finally {await p.close();}
    });

    await test("payment link failures offer a retry and recover the original requested split mode",async()=>{
      const order=fixture(); const p=await pageFor();
      const endpoint="**/api/pay/share/"+order.token;
      await p.route(endpoint,(route)=>route.abort("failed"));
      try {
        await goto(p,"/m/pay/"+order.token+"?mode=split");
        await p.locator(".pay-retry").waitFor();
        assert.equal(await p.locator(".pay-page .pay-submit").count(),0);
        await p.unroute(endpoint); await p.locator(".pay-retry").click();
        await p.locator("#pay-amount").waitFor();
        assert.equal(await p.locator("#pay-amount").inputValue(),"");
      } finally {await p.close();}
    });

    await test("a lost wallet payment response is reconciled without asking for the same contribution twice",async()=>{
      const order=fixture();const p=await visit(order,{split:true});let posts=0;
      await p.route("**/api/pay/for-enrollment",async(route)=>{
        posts++;
        const actual=await route.fetch();assert.equal(actual.status(),200);
        await route.abort("failed");
      });
      try {
        await p.locator("#pay-amount").fill("20");await wallet(p);await submit(p);
        await p.getByText("本次付款已到账",{exact:true}).waitFor();
        assert.equal(posts,1);assert.equal(rows(order).length,1);assert.equal(rows(order)[0].amount,20);
        assert.equal(await p.locator("#pay-amount").inputValue(),"");
        assert.equal(await p.locator("[data-mode=split]").getAttribute("aria-pressed"),"true");
      } finally {await p.close();}
    });

    await test("non-payable booking states have no payment actions and clearly distinguish refunds and lotteries",async()=>{
      for(const [status,payStatus,label] of [["joined","paid","团费已付清"],["cancelled","refunded","已退款"],["cancelled","unpaid","报名已取消"],["waitlist","unpaid","正在候补"],["applied","paid","等待抽签确认"],["joined","company_pending","企业统一支付"]]) {
        const order=fixture({status,payStatus,total:status==="applied"?0:101});
        const p=await pageFor();
        try {
          await goto(p,"/m/pay/"+order.token);
          await p.getByText(label,{exact:true}).first().waitFor();
          assert.equal(await p.locator(".pay-submit").count(),0);
          assert.equal(await p.locator("[data-mode]").count(),0);
        } finally {await p.close();}
      }
    });

    await test("fee payment fits narrow, large-text, dark, English and desktop views",async()=>{
      const order=fixture();
      for(const [width,night,size,lang] of [[320,"day",4,"zh"],[390,"day",1,"zh"],[390,"dark",1,"zh"],[320,"day",4,"en"],[1440,"day",1,"zh"]]) {
        const p=await visit(order,{width,look:{night,size,lang}});
        try {
          if(night==="dark") {
            assert.equal(await p.locator(".pay-summary").evaluate((node)=>getComputedStyle(node).backgroundColor),"rgb(36, 32, 41)","dark mode changes payment cards, not only the page background");
            const foreground=await p.locator(".pay-section-head h2").first().evaluate((node)=>getComputedStyle(node).color);
            assert.equal(foreground,"rgb(240, 235, 245)","headings remain legible in dark mode");
          }
          for(const mode of ["self","proxy","split"]) {
            await select(p,mode);
            if(mode==="split")await p.locator("#pay-amount").fill("20");
            assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`page overflow ${width}/${night}/${lang}/${mode}`);
            for(const box of await p.locator("[data-mode], [data-channel], .pay-submit").all()) {
              assert.ok(await box.evaluate((node)=>node.scrollWidth<=node.clientWidth+1),`control clips ${width}/${night}/${lang}/${mode}`);
            }
            await p.screenshot({path:path.join(output,`payment-${mode}-${width}-${night}-${size}-${lang}.png`),fullPage:true});
          }
        } finally {await p.close();}
      }
    });
  } finally {
    db.prepare("UPDATE users SET wallet_balance=? WHERE id=?").run(ownerBefore,seed.userId);
    db.prepare("UPDATE users SET wallet_balance=? WHERE id=?").run(helperBefore,seed.companyUserId);
    for(const id of created) { db.prepare("DELETE FROM payments WHERE enrollment_id=?").run(id); db.prepare("DELETE FROM enrollments WHERE id=?").run(id); }
  }
};
