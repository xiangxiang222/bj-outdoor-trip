const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");

function uploadedGroupQrImage(value) {
  const image = String(value || "").trim();
  return /^\/static\/uploads\/[\w-]+\.(png|jpe?g|webp|gif)$/i.test(image) &&
    fs.existsSync(path.join(config.publicDir, image.slice(1))) ? image : "";
}

function activityGroupInput(body = {}) {
  const consultGroup = String(body.consultGroup || "").trim();
  const consultGroupQrImage = String(body.consultGroupQrImage || "").trim();
  function fail(message) { const error = new Error(message); error.status = 400; throw error; }
  if (consultGroup.length > 80) fail("群说明请控制在80字以内");
  // Only accept a real image that has passed the authenticated upload endpoint.
  // Do not manufacture a QR code from a group name or arbitrary text.
  if (consultGroupQrImage && !uploadedGroupQrImage(consultGroupQrImage)) fail("请先上传有效的微信群二维码图片");
  return { consultGroup, consultGroupQrImage };
}

function canViewActivityGroup(schedule, userId, enrollment) {
  if (!userId) return false;
  if (Number(schedule.organizer_id) === Number(userId)) return true;
  return !!(enrollment && enrollment.status === "joined" && ["paid", "free", "company"].includes(enrollment.payStatus));
}

module.exports = { activityGroupInput, canViewActivityGroup, uploadedGroupQrImage };
