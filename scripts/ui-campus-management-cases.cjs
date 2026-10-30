const assert = require("node:assert/strict");
const path = require("node:path");

// Runs through the real local API; the caller owns an isolated temporary DB.
module.exports = async function campusManagementCases({ test, pageFor, goto, db, seed, origin, userToken, output }) {
  const headers = { authorization: `Bearer ${userToken}`, "content-type": "application/json" };
  const original = db.prepare("SELECT * FROM users WHERE id=?").get(seed.userId);
  const restore = () => db.prepare(`UPDATE users SET student_status=?,is_student=?,campus_kind=?,school=?,college=?,major=?,student_no=?,student_card_url=?,student_revision=?,student_history_json=? WHERE id=?`)
    .run(original.student_status, original.is_student, original.campus_kind, original.school, original.college, original.major, original.student_no, original.student_card_url, original.student_revision, original.student_history_json, seed.userId);
  async function profile(status = "approved", revision = 10) {
    db.prepare(`UPDATE users SET student_status=?,is_student=?,campus_kind='student',school='北京大学',college='元培学院',major='',student_no='20260001',student_card_url='/static/uploads/campus-browser.png',student_revision=? WHERE id=?`)
      .run(status, status === "approved" ? 1 : 0, revision, seed.userId);
    return (await (await fetch(origin + "/api/me", { headers })).json()).data;
  }
  async function visit(status = "approved", revision = 10, width = 390, look = {}) {
    const p = await pageFor("user", width, look, await profile(status, revision));
    await goto(p, "/m/student");
    await p.locator(".student-status").waitFor();
    await p.waitForFunction(() => !document.querySelector(".student-refresh"));
    return p;
  }
  const dialog = (p) => p.locator("dialog.student-confirm[open]");
  async function manage(p) { await p.getByRole("button", { name: /管理认证/ }).click(); }
  async function ready(p, name) { await dialog(p).getByRole("button", { name, exact: true }).waitFor(); await p.waitForFunction(() => !document.querySelector(".confirmation-loading")); }
  const current = () => db.prepare("SELECT * FROM users WHERE id=?").get(seed.userId);

  try {
    await test("campus withdrawal can be cancelled and then removes the real pending application once", async () => {
      const p = await visit("pending", 10);
      let posts = 0;
      p.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname.endsWith("/student/withdraw")) posts++; });
      try {
        await p.getByRole("button", { name: /撤回申请/ }).click();
        await ready(p, "确认撤回");
        await dialog(p).getByRole("button", { name: "先保留", exact: true }).click();
        assert.equal(current().student_status, "pending");
        assert.equal(posts, 0);
        await p.getByRole("button", { name: /撤回申请/ }).click();
        await ready(p, "确认撤回");
        await dialog(p).getByRole("button", { name: "确认撤回", exact: true }).click();
        await p.locator(".student-feedback").waitFor();
        assert.equal(current().student_status, "withdrawn");
        assert.equal(current().student_revision, 11);
        assert.equal(await p.locator("#student-number").inputValue(), "20260001");
        assert.equal(posts, 1);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_notices WHERE kind='campus' AND ref_id=? AND read_at IS NULL").get(seed.userId).n, 0);
      } finally { await p.close(); }
    });

    await test("campus editing remains local and alumni conversion needs a new document and explicit resubmission", async () => {
      const p = await visit("approved", 20);
      let posts = 0;
      p.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname.startsWith("/api/me/student")) posts++; });
      try {
        await manage(p);
        await p.getByRole("button", { name: /变更认证资料/ }).click();
        await p.locator("#student-number").fill("20269999");
        await p.getByRole("button", { name: "取消修改", exact: true }).click();
        assert.equal(current().student_status, "approved");
        assert.equal(current().student_no, "20260001");
        assert.equal(posts, 0);
        await manage(p);
        await p.getByRole("button", { name: /转为校友认证/ }).click();
        assert.equal(await p.locator("#student-number").count(), 0);
        assert.equal(await p.locator(".student-photo").count(), 0);
        await p.locator(".student-submit").click();
        await p.getByRole("alert").getByText("请上传毕业证或校友证照片", { exact: true }).waitFor();
        assert.equal(posts, 0);
        await p.locator("#student-card").setInputFiles({ name:"alumni.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
        await p.getByText("证件已上传", { exact: true }).waitFor();
        await p.locator(".student-submit").click();
        await ready(p, "确认提交审核");
        assert.equal(current().student_status, "approved", "preview is read-only");
        await dialog(p).getByRole("button", { name: "确认提交审核", exact: true }).click();
        await p.locator(".student-feedback").waitFor();
        assert.equal(current().campus_kind, "alumni");
        assert.equal(current().student_status, "pending");
        assert.equal(current().is_student, 0);
        assert.equal(current().school, "北京大学");
        assert.equal(current().student_no, "");
        assert.notEqual(current().student_card_url, "/static/uploads/campus-browser.png");
        assert.equal(posts, 1);
      } finally { await p.close(); }
    });

    await test("campus revocation shows actual booking counts and preserves existing paid seats and prices", async () => {
      const baseline = (await (await fetch(origin+"/api/me/student/manage",{headers})).json()).data.impact;
      const rows = [["joined","paid",73],["joined","unpaid",51],["applied","paid",0],["waitlist","unpaid",42]];
      const ids = rows.map(([status,pay,amount]) => Number(db.prepare("INSERT INTO enrollments (schedule_id,user_id,traveler_name,status,pay_status,pay_amount,campus_snapshot_json) VALUES (?,?,?,?,?,?,?)").run(seed.individualScheduleId,seed.userId,"认证管理测试",status,pay,amount,JSON.stringify({studentPrice:false})).lastInsertRowid));
      const p = await visit("approved", 30);
      try {
        await manage(p);
        await p.getByRole("button", { name: /解除校园认证/ }).click();
        await ready(p, "确认解除");
        assert.match(await dialog(p).locator(".confirmation-impact").innerText(), new RegExp(`已支付并确认\\s+${baseline.paidConfirmed+1} 笔`));
        const before = ids.map((id) => db.prepare("SELECT status,pay_status,pay_amount FROM enrollments WHERE id=?").get(id));
        await p.screenshot({ path:path.join(output,"campus-revoke-confirmation.png"),fullPage:true });
        await dialog(p).getByRole("button", { name:"确认解除",exact:true }).click();
        await p.locator(".student-feedback").waitFor();
        assert.equal(current().student_status,"revoked");
        assert.equal(current().student_card_url,"");
        assert.equal(current().student_no,"");
        assert.equal(current().school,"北京大学");
        assert.deepEqual(ids.map((id) => db.prepare("SELECT status,pay_status,pay_amount FROM enrollments WHERE id=?").get(id)),before);
        assert.equal(JSON.parse(await p.evaluate(() => localStorage.getItem("bj_user"))).isStudent,false);
      } finally { await p.close(); for (const id of ids) db.prepare("DELETE FROM enrollments WHERE id=?").run(id); }
    });

    await test("failed campus revocation keeps identity and repeated confirmations make one request", async () => {
      const p = await visit("approved", 40);
      let posts = 0;
      await p.route("**/api/me/student/revoke", async (route) => {
        posts++;
        await new Promise((resolve) => setTimeout(resolve, 150));
        await route.fulfill({ status:503,contentType:"application/json",body:JSON.stringify({ok:false,message:"测试：认证暂未解除，请重试"}) });
      });
      try {
        await manage(p);
        await p.getByRole("button", { name:/解除校园认证/ }).click();
        await ready(p,"确认解除");
        await dialog(p).getByRole("button", { name:"确认解除",exact:true }).evaluate((button) => { button.click(); button.click(); });
        await dialog(p).getByRole("alert").waitFor();
        assert.equal(posts,1);
        assert.equal(current().student_status,"approved");
        assert.equal(await dialog(p).getByRole("button", { name:"确认解除",exact:true }).isDisabled(),true);
        await dialog(p).getByRole("button", { name:"先保留",exact:true }).click();
        assert.equal(await p.locator(".student-form").count(),0);
      } finally { await p.close(); }
    });

    await test("campus confirmation reveals unclosed payments from ended trips before allowing a change", async () => {
      const schedule = db.prepare("SELECT start_date,end_date,status,completed_at FROM schedules WHERE id=?").get(seed.individualScheduleId);
      const id = Number(db.prepare("INSERT INTO enrollments(schedule_id,user_id,status,pay_status,pay_amount,campus_snapshot_json) VALUES (?,?,'joined','unpaid',80,?)").run(seed.individualScheduleId,seed.userId,JSON.stringify({studentPrice:false})).lastInsertRowid);
      const paymentId = Number(db.prepare("INSERT INTO payments(enrollment_id,user_id,schedule_id,amount,status,scene,wechat_prepay_id,created_at) VALUES(?,?,?,80,'cancelled','enrollment','wx-browser-open',datetime('now','localtime','-2 hours'))").run(id,seed.userId,seed.individualScheduleId).lastInsertRowid);
      db.prepare("UPDATE schedules SET start_date=date('now','+8 hours','-10 days'),end_date=date('now','+8 hours','-9 days'),status='completed',completed_at=datetime('now','localtime','-9 days') WHERE id=?").run(seed.individualScheduleId);
      const p = await visit("approved",45);
      let posts = 0;
      p.on("request",(r) => { if (r.method()==="POST" && new URL(r.url()).pathname.startsWith("/api/me/student")) posts++; });
      try {
        await manage(p);
        await p.locator(".student-revoke").click();
        await ready(p,"确认解除");
        assert.match(await dialog(p).locator(".confirmation-blockers").innerText(),/尚未|支付/);
        assert.match(await dialog(p).locator(".confirmation-blockers").innerText(),new RegExp(String(seed.individualScheduleId)));
        assert.equal(await dialog(p).locator(".confirmation-actions button").last().isDisabled(),true);
        assert.equal(posts,0);
        assert.equal(current().student_status,"approved");
        await p.screenshot({path:path.join(output,"campus-ended-payment-block.png"),fullPage:true});
      } finally {
        await p.close();
        db.prepare("DELETE FROM payments WHERE id=?").run(paymentId);
        db.prepare("DELETE FROM enrollments WHERE id=?").run(id);
        db.prepare("UPDATE schedules SET start_date=?,end_date=?,status=?,completed_at=? WHERE id=?").run(schedule.start_date,schedule.end_date,schedule.status,schedule.completed_at,seed.individualScheduleId);
      }
    });

    await test("campus confirmation explains unknown legacy prices without changing identity or the order", async () => {
      const id = Number(db.prepare("INSERT INTO enrollments(schedule_id,user_id,status,pay_status,pay_amount,campus_snapshot_json) VALUES (?,?,'joined','unpaid',80,'')").run(seed.individualScheduleId,seed.userId).lastInsertRowid);
      const p = await visit("approved",46);
      try {
        await manage(p);
        await p.locator(".student-revoke").click();
        await ready(p,"确认解除");
        assert.match(await dialog(p).locator(".confirmation-blockers").innerText(),/价格记录|价格来源/);
        assert.equal(await dialog(p).locator(".confirmation-actions button").last().isDisabled(),true);
        assert.equal(current().student_status,"approved");
        assert.equal(db.prepare("SELECT campus_snapshot_json FROM enrollments WHERE id=?").get(id).campus_snapshot_json,"");
        await p.screenshot({path:path.join(output,"campus-legacy-price-block.png"),fullPage:true});
      } finally { await p.close(); db.prepare("DELETE FROM enrollments WHERE id=?").run(id); }
    });

    await test("stale admin approval cannot revive a withdrawn application or approve its replacement", async () => {
      await profile("pending", 50);
      const p = await pageFor("admin",1440);
      try {
        await goto(p,"/admin/verify?kind=campus&userId="+seed.userId);
        const row = p.locator(".el-table__body tbody tr").filter({hasText:"林北野"});
        await row.getByRole("button",{name:"通过",exact:true}).waitFor();
        let response = await fetch(origin+"/api/me/student/withdraw",{method:"POST",headers,body:JSON.stringify({revision:50})});
        assert.equal(response.status,200);
        response = await fetch(origin+"/api/me/student",{method:"POST",headers,body:JSON.stringify({revision:51,campusKind:"student",school:"清华大学",studentNo:"20260002",studentCardUrl:"/static/uploads/new-campus-browser.png"})});
        assert.equal(response.status,200);
        const decided = p.waitForResponse((r) => r.request().method()==="POST" && new URL(r.url()).pathname.endsWith("/verify"));
        await row.getByRole("button",{name:"通过",exact:true}).click();
        assert.equal((await decided).status(),409);
        assert.equal(current().student_status,"pending");
        await p.waitForFunction(() => document.querySelector(".el-table__body")?.textContent.includes("清华大学"));
        const next = p.waitForResponse((r) => r.request().method()==="POST" && new URL(r.url()).pathname.endsWith("/verify"));
        await row.getByRole("button",{name:"通过",exact:true}).click();
        assert.equal((await next).status(),200);
        assert.equal(current().student_status,"approved");
      } finally { await p.close(); }
    });

    await test("campus management and confirmation fit narrow, large-text, dark, English and desktop views", async () => {
      for (const [width,night,size,lang] of [[320,"day",4,"zh"],[390,"day",1,"zh"],[390,"dark",1,"zh"],[320,"day",4,"en"],[1440,"day",1,"zh"]]) {
        const p = await visit("approved",60,width,{night,size,lang});
        try {
          if (width === 390 && night === "day") await p.locator(".student-result").screenshot({path:path.join(output,"campus-management-entry.png")});
          await p.locator(".student-manage-toggle").click();
          if (width === 390 && night === "day") await p.locator(".student-result").screenshot({path:path.join(output,"campus-management-expanded.png")});
          await p.locator(".student-revoke").click();
          await dialog(p).waitFor();
          await p.waitForFunction(() => !document.querySelector(".confirmation-loading"));
          assert.ok(await p.evaluate(() => document.documentElement.scrollWidth<=innerWidth+1),`page overflows ${width}/${night}/${size}/${lang}`);
          assert.ok(await dialog(p).evaluate((d) => d.scrollWidth<=d.clientWidth+1),`dialog overflows ${width}/${night}/${size}/${lang}`);
          await dialog(p).locator(".confirmation-actions button").last().scrollIntoViewIfNeeded();
          const button = await dialog(p).locator(".confirmation-actions button").last().boundingBox();
          assert.ok(button && button.y>=0 && button.y+button.height<=p.viewportSize().height+1,"confirmation is reachable");
          await p.screenshot({path:path.join(output,`campus-management-${width}-${night}-${size}-${lang}.png`),fullPage:true});
          await p.keyboard.press("Escape");
          assert.equal(await dialog(p).count(),0);
        } finally { await p.close(); }
      }
    });
  } finally { restore(); }
};
