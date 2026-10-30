const crypto = require('crypto');
const { getDb } = require('../db');
const { maskName } = require('./biz');
const { payProgress, ensurePayShareToken } = require('./pay-ledger');
const { campusEnrollmentCheck } = require('./campus-certification');
const { assertTexts } = require('./content-security');
const { pushUserNotice } = require('./mine-desk');

const CATEGORIES = [
  { key:'drink', label:'一杯心意', title:'请你喝杯喜欢的', description:'一杯奶茶或咖啡，留一点相聚的时间。' },
  { key:'meal', label:'好好吃饭', title:'找个时间，一起吃饭', description:'选一家喜欢的店，约一顿好好吃的饭。' },
  { key:'outing', label:'一起去玩', title:'把想去的地方，变成约定', description:'看展、逛景点，把日常过得有趣一点。' },
  { key:'show', label:'一起看场', title:'喜欢的现场，一起去', description:'电影或演出，邀请朋友认领安排。' },
  { key:'transport', label:'送你一程', title:'下一站，有人惦记', description:'一张车票的心意，由朋友自行安排。' },
  { key:'trip', label:'旅行心意', title:'这一程，我们一起', description:'可关联真实报名订单，邀请朋友代付或分摊。' },
  { key:'other', label:'小小心愿', title:'小心愿，也值得被记住', description:'把想做的事写下来，等一个愿意同行的人。' },
];
function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
function text(value, name, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') fail(400, `${name}格式不正确`);
  const s = value.trim();
  if ((required && !s) || Array.from(s).length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s)) fail(400, `请填写${name}（最多${max}字）`);
  return s;
}
function requestKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{12,80}$/.test(value)) fail(400, '请求标识无效，请刷新后重试');
  return value;
}
function user(id) { return getDb().prepare('SELECT * FROM users WHERE id=? AND deleted_at IS NULL').get(id || 0); }
function named(id) { const u = user(id); return u ? (u.nickname || '同行好友') : '已注销用户'; }
function rowFor(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) fail(404, '心愿不存在或已失效');
  const w = getDb().prepare('SELECT w.* FROM wishes w JOIN users u ON u.id=w.owner_id WHERE w.token=? AND u.deleted_at IS NULL').get(token);
  if (!w) fail(404, '心愿不存在或已失效');
  return w;
}
function todayShanghai() { return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Shanghai', year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date()); }
function sourceOrder(id) {
  const db = getDb();
  const en = db.prepare('SELECT * FROM enrollments WHERE id=?').get(id);
  const schedule = en && db.prepare('SELECT * FROM schedules WHERE id=?').get(en.schedule_id);
  const route = schedule && db.prepare('SELECT title FROM routes WHERE id=?').get(schedule.route_id);
  return { en, schedule, title:route?.title || schedule?.organizer_name || '同行行程' };
}
function orderInfo(id) {
  const { en, schedule, title } = sourceOrder(id);
  if (!en || !schedule) return null;
  const owner = user(en.user_id);
  const progress = payProgress(en);
  const cancelled = schedule.status === 'cancelled' || en.status === 'cancelled';
  const available = !!owner && !owner.is_virtual && !schedule.started_at && !schedule.completed_at && en.status === 'joined' && en.pay_status === 'unpaid'
    && ['recruiting','confirmed'].includes(schedule.status) && schedule.review_status === 'approved'
    && /^\d{4}-\d{2}-\d{2}$/.test(schedule.start_date || '') && schedule.start_date >= todayShanghai()
    && Number.isSafeInteger(progress.payAmount) && progress.payAmount > 0 && progress.remainAmount > 0
    && campusEnrollmentCheck(en, schedule).ok;
  return { title,startDate:schedule.start_date,payAmount:progress.payAmount,paidAmount:progress.paidAmount,
    remainAmount:progress.remainAmount,payStatus:en.pay_status,enrollmentStatus:en.status,cancelled,canPay:available };
}
function view(w, viewerId) {
  const db = getDb();
  const isOwner = Number(viewerId || 0) === w.owner_id;
  const isClaimant = Number(viewerId || 0) === w.claimed_by;
  const open = w.status === 'open';
  const order = w.enrollment_id ? orderInfo(w.enrollment_id) : null;
  const blessings = db.prepare('SELECT * FROM wish_blessings WHERE wish_id=? ORDER BY id DESC LIMIT 100').all(w.id).map(b => ({
    id:b.id,nickname:named(b.user_id),self:Number(viewerId || 0) === b.user_id,message:b.message,createdAt:b.created_at,
  }));
  const hasBlessed = !!viewerId && !!db.prepare('SELECT 1 FROM wish_blessings WHERE wish_id=? AND user_id=?').get(w.id,viewerId);
  return { token:w.token,kind:w.kind,title:w.title,recipientName:w.recipient_name,note:w.note,ownerName:named(w.owner_id),
    isOwner,isClaimant,claimedByName:w.claimed_by ? named(w.claimed_by) : '',
    claimStatus:w.claimed_by ? (w.completed_at ? 'completed' : 'claimed') : null,
    status:w.status,revision:w.revision,createdAt:w.created_at,completedAt:w.completed_at,
    paymentMode:w.enrollment_id ? 'enrollment' : 'claim',order,blessings,
    canClaim:!!viewerId && open && !w.enrollment_id && !isOwner && !w.claimed_by,
    canRelease:!!viewerId && open && isClaimant,canComplete:!!viewerId && open && isClaimant,
    canClose:!!viewerId && isOwner && w.status !== 'closed',canPay:!!viewerId && open && !!order?.canPay,
    canBless:!!viewerId && open && !hasBlessed,hasBlessed,
  };
}
function notify(w, recipient, action) {
  if (!user(recipient)) return;
  const copy = {
    claim:['心愿被认领了','有朋友愿意为你安排这份小美好，去看看吧。'],
    release:['心愿等待新的认领','朋友归还了这份认领，你可以重新邀请朋友安排。'],
    complete:['朋友已安排好','认领人已标记安排完成，记得和朋友确认具体安排。'],
    close:['心愿已关闭','发起人关闭了心愿，请与对方沟通已约定的安排。'],
    bless:['收到一份祝福','有朋友为你的心愿留下了一份心意。'],
  }[action];
  pushUserNotice({userId:recipient,kind:'wish_'+action,title:copy[0],body:copy[1],href:'/m/wishes/'+w.token,refType:'wish',refId:w.id});
}
function participate(w, id) {
  if (id !== w.owner_id) getDb().prepare('INSERT OR IGNORE INTO wish_participants(wish_id,user_id,created_at) VALUES(?,?,?)').run(w.id,id,new Date().toISOString());
}
async function create(ownerId, body = {}) {
  if (!body || Array.isArray(body) || typeof body !== 'object') fail(400, '请填写心愿内容');
  if (Object.keys(body).some(k => !['idempotencyKey','kind','title','recipientName','note','enrollmentId'].includes(k))) fail(400,'心愿不支持自定义收款或资金目标');
  const key = requestKey(body.idempotencyKey);
  if (!CATEGORIES.some(k => k.key === body.kind)) fail(400,'请选择心愿类型');
  const input = { kind:body.kind,title:text(body.title,'心愿标题',40,true),recipientName:text(body.recipientName,'心意对象',20),note:text(body.note,'心愿说明',240),enrollmentId:null };
  if (body.enrollmentId != null && body.enrollmentId !== '') {
    if (typeof body.enrollmentId !== 'number' || !Number.isSafeInteger(body.enrollmentId) || body.enrollmentId <= 0 || input.kind !== 'trip') fail(400,'请选择有效的本人行程订单');
    input.enrollmentId = body.enrollmentId;
  }
  const canonical = JSON.stringify(input);
  await assertTexts(user(ownerId)?.wechat_openid, 2, [input.title,input.recipientName,input.note]);
  return getDb().transaction(() => {
    const db = getDb();
    const old = db.prepare('SELECT * FROM wishes WHERE owner_id=? AND request_key=?').get(ownerId,key);
    if (old) { if (old.request_json !== canonical) fail(409,'这次提交内容已改变，请重新发起'); return view(old,ownerId); }
    if (!user(ownerId) || user(ownerId).is_virtual) fail(403,'当前账号不可发起心愿');
    if (db.prepare("SELECT COUNT(*) n FROM wishes WHERE owner_id=? AND created_at>=?").get(ownerId,new Date(Date.now()-86400000).toISOString()).n >= 20) fail(429,'今天发起的心愿较多，请明天再试');
    if (input.enrollmentId) {
      const { en } = sourceOrder(input.enrollmentId);
      if (!en) fail(404,'报名订单不存在');
      if (en.user_id !== ownerId) fail(403,'只能关联自己的行程订单');
      if (db.prepare('SELECT 1 FROM wishes WHERE enrollment_id=?').get(en.id)) fail(409,'这笔订单已有心愿，请前往我的心意簿查看');
      if (!orderInfo(en.id)?.canPay) fail(409,'这笔订单当前不可付款，请重新选择');
      input.recipientName = maskName(en.traveler_name || user(ownerId).nickname);
    }
    const token = crypto.randomBytes(24).toString('base64url');
    const result = db.prepare('INSERT INTO wishes(token,owner_id,request_key,request_json,kind,title,recipient_name,note,enrollment_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(token,ownerId,key,canonical,input.kind,input.title,input.recipientName,input.note,input.enrollmentId,new Date().toISOString());
    return view(db.prepare('SELECT * FROM wishes WHERE id=?').get(result.lastInsertRowid),ownerId);
  })();
}
function list(viewerId, query = {}) {
  const limit = Math.min(50,Math.max(1,Number.parseInt(query.limit,10) || 30));
  let cursor = Number.MAX_SAFE_INTEGER;
  if (query.cursor != null && query.cursor !== '') {
    if (!/^\d+$/.test(String(query.cursor)) || !Number.isSafeInteger(Number(query.cursor)) || Number(query.cursor) <= 0) fail(400,'分页标识无效');
    cursor = Number(query.cursor);
  }
  if (query.tab && !['created','joined'].includes(query.tab)) fail(400,'心意簿分类无效');
  const joined = query.tab === 'joined';
  const condition = joined ? `w.owner_id!=@uid AND (EXISTS(SELECT 1 FROM wish_participants x WHERE x.wish_id=w.id AND x.user_id=@uid)
    OR EXISTS(SELECT 1 FROM payments p WHERE p.enrollment_id=w.enrollment_id AND p.user_id=@uid AND IFNULL(p.refund_of,0)=0 AND p.status IN ('success','refunded') AND IFNULL(p.scene,'')!='member'))` : 'w.owner_id=@uid';
  const rows = getDb().prepare(`SELECT w.* FROM wishes w JOIN users u ON u.id=w.owner_id AND u.deleted_at IS NULL WHERE w.id<@cursor AND ${condition} ORDER BY w.id DESC LIMIT @limit`).all({uid:viewerId,cursor,limit:limit+1});
  const items = rows.slice(0,limit);
  return { items:items.map(w=>view(w,viewerId)),hasMore:rows.length>limit,nextCursor:rows.length>limit ? String(items[items.length-1].id) : null };
}
function orders(ownerId) {
  const rows = getDb().prepare("SELECT id,traveler_name FROM enrollments WHERE user_id=? AND status='joined' AND pay_status='unpaid' AND id NOT IN (SELECT enrollment_id FROM wishes WHERE enrollment_id IS NOT NULL) ORDER BY id DESC").all(ownerId);
  return {items:rows.map(en=>({en,info:orderInfo(en.id)})).filter(x=>x.info?.canPay).map(({en,info})=>({enrollmentId:en.id,...info,recipientName:maskName(en.traveler_name || user(ownerId)?.nickname),travelerName:maskName(en.traveler_name || user(ownerId)?.nickname)}))};
}
function mutate(token, viewerId, action, revision) {
  return getDb().transaction(() => {
    const w = rowFor(token);
    if (!user(viewerId)) fail(401,'账号已注销');
    if (!Number.isSafeInteger(revision) || revision !== w.revision) fail(409,'心愿状态已变化，请刷新后再试');
    if (action === 'close') {
      if (w.owner_id !== viewerId) fail(403,'只有发起人可以关闭心愿');
      if (w.status === 'closed') fail(409,'心愿已关闭');
      getDb().prepare("UPDATE wishes SET status='closed',revision=revision+1 WHERE id=?").run(w.id);
    } else {
      if (w.enrollment_id) fail(409,'旅行订单请通过真实订单付款，无需认领安排');
      if (w.status !== 'open') fail(409,'心愿已结束');
      if (action === 'claim') {
        if (viewerId === w.owner_id) fail(403,'不能认领自己发起的心愿');
        if (w.claimed_by) fail(409,'这份心意已被朋友认领');
        getDb().prepare('UPDATE wishes SET claimed_by=?,claimed_at=?,revision=revision+1 WHERE id=?').run(viewerId,new Date().toISOString(),w.id);
        participate(w,viewerId);
      } else {
        if (w.claimed_by !== viewerId) fail(403,'只有认领人可以操作');
        if (action === 'release') getDb().prepare('UPDATE wishes SET claimed_by=NULL,claimed_at=NULL,revision=revision+1 WHERE id=?').run(w.id);
        else if (action === 'complete') getDb().prepare("UPDATE wishes SET status='completed',completed_at=?,revision=revision+1 WHERE id=?").run(new Date().toISOString(),w.id);
        else fail(400,'操作无效');
      }
    }
    if (action === 'close') { if (w.claimed_by) notify(w,w.claimed_by,'close'); }
    else notify(w,w.owner_id,action);
    return view(rowFor(token),viewerId);
  })();
}
async function bless(token, viewerId, body = {}) {
  const key = requestKey(body.idempotencyKey);
  const message = text(body.message,'祝福',80,true);
  await assertTexts(user(viewerId)?.wechat_openid, 2, [message]);
  return getDb().transaction(() => {
    const w = rowFor(token), db = getDb();
    if (!user(viewerId)) fail(401,'账号已注销');
    const old = db.prepare('SELECT * FROM wish_blessings WHERE wish_id=? AND user_id=?').get(w.id,viewerId);
    if (old) {
      if (old.request_key !== key || old.message !== message) fail(409,'你已经送过祝福了');
      return view(w,viewerId);
    }
    if (w.status !== 'open') fail(409,'心愿已结束，不能继续留言');
    db.prepare('INSERT INTO wish_blessings(wish_id,user_id,request_key,message,created_at) VALUES(?,?,?,?,?)').run(w.id,viewerId,key,message,new Date().toISOString());
    participate(w,viewerId);
    if (viewerId !== w.owner_id) notify(w,w.owner_id,'bless');
    return view(w,viewerId);
  })();
}
function canLinkEnrollment(enrollmentId) {
  const id = Number(enrollmentId);
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  if (getDb().prepare('SELECT 1 FROM wishes WHERE enrollment_id=?').get(id)) return false;
  return !!orderInfo(id)?.canPay;
}
function payment(token,viewerId) {
  const w = rowFor(token);
  if (!w.enrollment_id) fail(400,'这份心愿仅支持认领安排，无需付款');
  if (w.status !== 'open' || !orderInfo(w.enrollment_id)?.canPay) fail(409,'心愿或订单状态已变化，当前不能付款');
  if (!user(viewerId) || user(viewerId).is_virtual) fail(403,'当前账号不可付款');
  return { token:ensurePayShareToken(w.enrollment_id),mode:'split' };
}
module.exports = { CATEGORIES,create,list,orders,detail:(token,uid)=>view(rowFor(token),uid),mutate,bless,payment,canLinkEnrollment };
