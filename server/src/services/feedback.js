const { getDb } = require("../db");
const { noticeFeedback } = require("./notices");

const MAX_CONTENT = 200;
const MAX_IMAGES = 3;

const KINDS = {
  suggest: { channel: "experience", label: "功能建议" },
  enroll: { channel: "experience", label: "报名遇到问题" },
  perf: { channel: "experience", label: "性能问题" },
  other: { channel: "experience", label: "其他" },
  bug: { channel: "experience", label: "找 BUG" },
  trip: { channel: "complaint", label: "活动体验" },
  guide: { channel: "complaint", label: "领队服务" },
  refund: { channel: "complaint", label: "费用与退款" },
  safety: { channel: "complaint", label: "安全问题" },
};

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function imagePath(raw) {
  const pathOnly = String(raw || "").trim().replace(/^https?:\/\/[^/]+/i, "");
  if (/^\/static\/uploads\/[\w.-]+\.(jpe?g|png|webp|gif)$/i.test(pathOnly)) return pathOnly;
  return "";
}

function imagesOf(raw) {
  if (raw == null || raw === "") return [];
  if (!Array.isArray(raw)) fail(400, "图片格式不正确");
  if (raw.length > MAX_IMAGES) fail(400, "最多上传 3 张图片");
  const out = [];
  for (const item of raw) {
    const path = imagePath(item);
    if (!path) fail(400, "图片地址不正确");
    if (!out.includes(path)) out.push(path);
  }
  return out;
}

function submitFeedback(userId, body) {
  const spec = KINDS[String((body || {}).kind || "").trim()];
  if (!spec) fail(400, "请选择问题类型");
  const content = String((body || {}).content || "").trim();
  if (content.length < 4) fail(400, "请写清楚建议或问题");
  if (content.length > MAX_CONTENT) fail(400, "请控制在 200 字以内");
  const images = imagesOf((body || {}).images);
  const db = getDb();
  const user = db.prepare("SELECT id, nickname, phone FROM users WHERE id=?").get(userId);
  if (!user) fail(401, "请先登录");
  const result = db
    .prepare("INSERT INTO feedbacks (user_id, kind, channel, content, images_json) VALUES (?,?,?,?,?)")
    .run(userId, String(body.kind).trim(), spec.channel, content, JSON.stringify(images));
  const id = Number(result.lastInsertRowid);
  noticeFeedback({ id, channel: spec.channel, label: spec.label, content }, user);
  return { id, kind: String(body.kind).trim(), channel: spec.channel, label: spec.label };
}

function parseImages(raw) {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list.filter((item) => imagePath(item)) : [];
  } catch {
    return [];
  }
}

function listFeedbacks(channel) {
  const db = getDb();
  const want = channel === "experience" || channel === "complaint" ? channel : "";
  const rows = db
    .prepare(
      `SELECT f.id, f.user_id, f.kind, f.channel, f.content, f.images_json, f.created_at,
              u.nickname, u.phone
       FROM feedbacks f
       LEFT JOIN users u ON u.id = f.user_id
       ORDER BY f.id DESC
       LIMIT 100`
    )
    .all();
  return rows
    .map((row) => {
      const spec = KINDS[row.kind] || { channel: row.channel || "experience", label: row.kind || "反馈" };
      const ch = row.channel || spec.channel || "experience";
      return {
        id: row.id,
        userId: row.user_id,
        nickname: row.nickname || "",
        phone: row.phone || "",
        kind: row.kind,
        channel: ch,
        channelLabel: ch === "complaint" ? "活动、领队投诉" : "体验问题",
        label: spec.label,
        content: row.content || "",
        images: parseImages(row.images_json),
        createdAt: row.created_at,
      };
    })
    .filter((row) => !want || row.channel === want);
}

module.exports = {
  KINDS,
  submitFeedback,
  listFeedbacks,
};
