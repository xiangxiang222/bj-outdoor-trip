const dayjs = require("dayjs");
const { getDb } = require("../db");
const config = require("../config");
const { liveMemberPrice } = require("./offer");
const { paidJoinedCount } = require("./helpers");
const { sendSms } = require("./sms");
const { noticeRouteApply, resolveNotices } = require("./notices");
const { pushUserNotice } = require("./mine-desk");
const { scheduleRouteI18n } = require("./route-i18n");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function bountyYuan() {
  return Math.max(0, Math.round(Number(config.routeApply?.bounty || 300)));
}

function reviewOf(row) {
  if (!row) return "approved";
  if (row.review_status) return row.review_status;
  if (Number(row.submitted_by || 0) && row.status !== "on") return "pending";
  return "approved";
}

function isListed(row) {
  return (row.status || "on") === "on" && reviewOf(row) === "approved";
}

function applicationView(row, { admin } = {}) {
  const reviewStatus = reviewOf(row);
  const bountyStatus = row.bounty_status || "";
  const bountyAmount = Number(row.bounty_amount || 0);
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    subtitle: row.subtitle || "",
    days: Number(row.days) || 1,
    region: row.region || "",
    cover: row.cover || "",
    description: row.description || "",
    minGroupSize: Number(row.min_group_size) || 10,
    suggestedPrice: Number(row._suggested_price || 0) || 0,
    reviewStatus,
    reviewNote: row.review_note || "",
    reviewedAt: row.reviewed_at || "",
    submittedBy: Number(row.submitted_by || 0),
    applicantName: row.applicant_name || "",
    contactPhone: row.contact_phone || "",
    contactWechat: row.contact_wechat || "",
    bountyAmount,
    bountyStatus,
    bountyPaidAt: row.bounty_paid_at || "",
    bountyHint:
      reviewStatus === "rejected"
        ? "未通过"
        : reviewStatus === "pending"
          ? "审核中，通过后会出现在线路目录"
          : "已通过，已出现在线路目录",
    status: row.status,
    createdAt: row.created_at || "",
  };
}

function listMine(userId) {
  return getDb()
    .prepare(
      `SELECT r.*, u.nickname AS applicant_name FROM routes r
       LEFT JOIN users u ON u.id=r.submitted_by
       WHERE r.submitted_by=? ORDER BY r.id DESC`
    )
    .all(userId)
    .map((row) => applicationView(row, { admin: true }));
}

function submitApply(user, body) {
  const db = getDb();
  const title = String((body && body.title) || "").trim();
  if (title.length < 2) fail(400, "请填写线路标题");
  const region = String((body && (body.region || body.city)) || "").trim();
  if (!region) fail(400, "请填写地区");
  const phone = String((body && (body.contactPhone || body.contact_phone)) || user.phone || "").trim();
  if (!/^1\d{10}$/.test(phone)) fail(400, "请填写11位手机号");
  const wechat = String((body && (body.contactWechat || body.contact_wechat)) || "").trim();
  if (wechat.length < 2 || wechat.length > 32) fail(400, "请填写微信号，方便通过后联系你");
  const dup = db
    .prepare(
      "SELECT id FROM routes WHERE submitted_by=? AND title=? AND IFNULL(review_status,'')='pending'"
    )
    .get(user.id, title);
  if (dup) fail(400, "已有相同标题的申请在审");
  const days = String((body && body.days) || "") === "multi" ? 5 : Number(body && body.days) || 1;
  const originPrice = Math.max(0, Math.round(Number((body && (body.originPrice || body.price)) || 0)));
  const minGroup = Math.max(1, Number((body && body.minGroupSize) || 10) || 10);
  const cover = String((body && body.cover) || "").trim();
  const bounty = bountyYuan();
  const info = db
    .prepare(
      `INSERT INTO routes (code,title,subtitle,days,distance_km,difficulty,category,region,season,tags_json,cover,gallery_json,min_group_size,description,highlights_json,itinerary_json,fee_include,fee_exclude,equipment,notices,meetup_json,status,submitted_by,contact_phone,contact_wechat,review_status,bounty_status,bounty_amount)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      `U${Date.now()}`,
      title,
      String((body && body.subtitle) || "").trim(),
      days,
      0,
      "休闲",
      "山水",
      region,
      "四季",
      "[]",
      cover,
      JSON.stringify(cover ? [cover] : []),
      minGroup,
      String((body && body.description) || "").trim(),
      "[]",
      "[]",
      "",
      "",
      "",
      "",
      "[]",
      "pending",
      user.id,
      phone,
      wechat,
      "pending",
      "pending",
      bounty
    );
  const routeId = Number(info.lastInsertRowid);
  scheduleRouteI18n(routeId);
  db.prepare("INSERT INTO route_price_tiers (route_id,min_people,max_people,price,member_price) VALUES (?,?,?,?,?)").run(
    routeId,
    10,
    null,
    originPrice,
    liveMemberPrice(originPrice)
  );
  const bus = db.prepare("SELECT id FROM bus_types ORDER BY sort_order, id LIMIT 1").get();
  if (bus) db.prepare("INSERT INTO route_buses (route_id, bus_type_id) VALUES (?,?)").run(routeId, bus.id);
  const row = db
    .prepare(
      `SELECT r.*, u.nickname AS applicant_name FROM routes r
       LEFT JOIN users u ON u.id=r.submitted_by WHERE r.id=?`
    )
    .get(routeId);
  noticeRouteApply(row);
  return applicationView(row, { admin: true });
}

function reviewApply(routeId, { action, note, adminId } = {}) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM routes WHERE id=?").get(routeId);
  if (!row) fail(404, "线路不存在");
  if (!Number(row.submitted_by || 0)) fail(400, "官方线路请用上下架，不必走申请审批");
  const act = String(action || "").trim();
  if (act !== "approve" && act !== "reject") fail(400, "请选择通过或驳回");
  if (reviewOf(row) === "approved" && act === "approve") fail(400, "该申请已通过");
  const trimmed = String(note || "").trim().slice(0, 200);
  if (act === "reject" && reviewOf(row) === "rejected") fail(400, "该申请已驳回");
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
  if (act === "approve") {
    db.prepare(
      "UPDATE routes SET status='on', review_status='approved', review_note=?, reviewed_at=? WHERE id=?"
    ).run(trimmed, now, row.id);
    sendSms({
      phone: row.contact_phone,
      scene: "route",
      content: `【同行者众】线路「${row.title}」已通过，已出现在线路目录。`,
      refType: "route",
      refId: row.id,
    });
  } else {
    db.prepare(
      "UPDATE routes SET status='off', review_status='rejected', review_note=?, reviewed_at=?, bounty_status='' WHERE id=?"
    ).run(trimmed || "未通过", now, row.id);
    sendSms({
      phone: row.contact_phone,
      scene: "route",
      content: `【同行者众】线路「${row.title}」未通过${trimmed ? "：" + trimmed : ""}。`,
      refType: "route",
      refId: row.id,
    });
  }
  resolveNotices("route", "route", row.id, adminId);
  if (row.submitted_by) {
    pushUserNotice({
      userId: row.submitted_by,
      kind: "route_review",
      title: act === "approve" ? "线路已通过" : "线路未通过",
      body: act === "approve" ? `「${row.title}」已出现在线路目录` : `「${row.title}」未通过${trimmed ? "：" + trimmed : ""}`,
      href: "/m/route-apply",
      refType: "route",
      refId: row.id,
    });
  }
  const next = db
    .prepare(
      `SELECT r.*, u.nickname AS applicant_name FROM routes r
       LEFT JOIN users u ON u.id=r.submitted_by WHERE r.id=?`
    )
    .get(row.id);
  return applicationView(next, { admin: true });
}

function settleRouteBounty(sch) {
  if (!sch || sch.status === "cancelled") return null;
  if ((sch.review_status || "approved") !== "approved") return null;
  const db = getDb();
  const route = db.prepare("SELECT * FROM routes WHERE id=?").get(sch.route_id);
  if (!route || !Number(route.submitted_by || 0)) return null;
  if (reviewOf(route) !== "approved" || route.status !== "on") return null;
  if (route.bounty_status !== "pending") return null;
  const need = Number(sch.min_group_size || route.min_group_size || 0);
  if (need <= 0) return null;
  if (paidJoinedCount(sch.id) < need) return null;
  const amount = Number(route.bounty_amount || bountyYuan());
  if (amount <= 0) {
    db.prepare("UPDATE routes SET bounty_status='paid', bounty_paid_at=datetime('now','localtime'), bounty_schedule_id=? WHERE id=?").run(
      sch.id,
      route.id
    );
    return { amount: 0, mock: true };
  }
  const locked = db
    .prepare("UPDATE routes SET bounty_status='paying', bounty_schedule_id=? WHERE id=? AND bounty_status='pending'")
    .run(sch.id, route.id);
  if (!locked.changes) return null;
  const tradeNo = `RB${Date.now()}${route.submitted_by}`.slice(0, 32);
  try {
    const info = db.prepare(
      "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene) VALUES (?,?,?,?,?,?,?,?,?)"
    ).run(0, route.submitted_by, sch.id, amount, "bounty", "success", tradeNo, "线路首次成团奖励", "route_bounty");
    require("./wallet").credit(route.submitted_by, amount, {
      reason: "线路首次成团奖励",
      scene: "route_bounty",
      refType: "payment",
      refId: Number(info.lastInsertRowid),
    });
  } catch {
    db.prepare("UPDATE routes SET bounty_status='pending' WHERE id=? AND bounty_status='paying'").run(route.id);
    return null;
  }
  db.prepare("UPDATE routes SET bounty_status='paid', bounty_paid_at=datetime('now','localtime') WHERE id=?").run(route.id);
  sendSms({
    phone: route.contact_phone,
    scene: "route",
    content: `【同行者众】线路「${route.title}」首次成团，奖励 ${amount} 元已入账钱包。`,
    refType: "route",
    refId: route.id,
  });
  return { amount, mock: true, tradeNo };
}

function adminFields(row) {
  return {
    submittedBy: Number(row.submitted_by || 0),
    applicantName: row.applicant_name || "",
    contactPhone: row.contact_phone || "",
    contactWechat: row.contact_wechat || "",
    reviewStatus: reviewOf(row),
    reviewNote: row.review_note || "",
    reviewedAt: row.reviewed_at || "",
    bountyAmount: Number(row.bounty_amount || 0),
    bountyStatus: row.bounty_status || "",
    bountyPaidAt: row.bounty_paid_at || "",
  };
}

module.exports = {
  bountyYuan,
  applicationView,
  listMine,
  submitApply,
  reviewApply,
  settleRouteBounty,
  adminFields,
  reviewOf,
  isListed,
};
