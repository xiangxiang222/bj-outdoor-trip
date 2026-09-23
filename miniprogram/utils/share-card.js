function loadCover(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    wx.getImageInfo({
      src,
      success: (res) => resolve(res),
      fail: () => resolve(null),
    });
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function yuan(n) {
  const v = Number(n);
  return isFinite(v) ? Math.round(v) : 0;
}

function drawCover(ctx, cover, x, y, w, h) {
  if (cover && cover.path) {
    try {
      ctx.drawImage(cover.path, x, y, w, h);
      return;
    } catch (e) {
      /* fallback block */
    }
  }
  ctx.fillStyle = "#1b4332";
  ctx.fillRect(x, y, w, h);
}

function canvasToFile(canvas) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      fileType: "png",
      quality: 0.92,
      success: (r) => resolve(r.tempFilePath),
      fail: reject,
    });
  });
}

async function getCanvas(page, id, cssW, cssH) {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery()
      .in(page)
      .select(id)
      .fields({ node: true, size: true })
      .exec((res) => {
        const node = res && res[0] && res[0].node;
        if (!node) return reject(new Error("canvas missing"));
        const dpr = wx.getSystemInfoSync().pixelRatio || 2;
        node.width = cssW * dpr;
        node.height = cssH * dpr;
        const ctx = node.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        resolve({ canvas: node, ctx });
      });
  });
}

async function drawShareCard(page, facts) {
  const w = 500;
  const h = 400;
  const { canvas, ctx } = await getCanvas(page, "#shareCardCanvas", w, h);
  const cover = await loadCover(facts.cover);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  drawCover(ctx, cover, 0, 0, w, 228);
  ctx.fillStyle = "#111111";
  ctx.font = "700 22px sans-serif";
  ctx.fillText(String(facts.title || "行程").slice(0, 16), 24, 268);
  ctx.fillStyle = "#c2410c";
  ctx.font = "800 32px sans-serif";
  ctx.fillText(facts.free ? "免费" : "¥" + yuan(facts.price), 24, 310);
  roundRect(ctx, 24, 328, 132, 40, 20);
  ctx.fillStyle = "#e11d48";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 16px sans-serif";
  ctx.fillText("立即报名", 48, 354);
  ctx.fillStyle = "#888888";
  ctx.font = "13px sans-serif";
  ctx.fillText("同行者众", 400, 354);
  return canvasToFile(canvas);
}

async function drawSharePoster(page, facts, qrSrc) {
  const w = 375;
  const h = 490;
  const { canvas, ctx } = await getCanvas(page, "#sharePosterCanvas", w, h);
  const cover = await loadCover(facts.cover);
  const qr = await loadCover(qrSrc);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  drawCover(ctx, cover, 0, 0, w, 180);
  roundRect(ctx, 14, 192, 36, 18, 9);
  ctx.fillStyle = "#1b4332";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 11px sans-serif";
  ctx.fillText(facts.kindLabel || "个人", 18, 205);
  ctx.fillStyle = "#111111";
  ctx.font = "700 16px sans-serif";
  ctx.fillText(String(facts.title || "行程").slice(0, 14), 56, 206);
  ctx.fillStyle = "#c2410c";
  ctx.font = "800 22px sans-serif";
  ctx.fillText(facts.free ? "免费" : "¥" + yuan(facts.originPrice || facts.price), 14, 248);
  ctx.font = "13px sans-serif";
  if (!facts.free) {
    ctx.fillText("会员 ¥" + yuan(facts.memberPrice), 110, 248);
    ctx.fillText("学生 ¥" + yuan(facts.studentPrice), 200, 248);
  }
  ctx.fillStyle = "#888888";
  ctx.font = "12px sans-serif";
  ctx.fillText("时间", 14, 286);
  ctx.fillText("集合", 14, 310);
  ctx.fillText("人数", 14, 334);
  ctx.fillStyle = "#111111";
  ctx.font = "13px sans-serif";
  ctx.fillText(String(facts.startDate || "") + " " + String(facts.meetupTime || ""), 46, 286);
  ctx.fillText(String(facts.meetupPoint || "").slice(0, 14), 46, 310);
  ctx.fillText("已报名 " + (facts.enrolled || 0) + "/" + (facts.maxSeats || 0), 46, 334);
  if (qr && qr.path) ctx.drawImage(qr.path, 250, 220, 110, 110);
  ctx.fillStyle = "#c2410c";
  ctx.font = "700 12px sans-serif";
  ctx.fillText("扫码报名", 268, 214);
  roundRect(ctx, 14, 360, 347, 110, 12);
  ctx.fillStyle = "#f4efe6";
  ctx.fill();
  ctx.fillStyle = "#1b4332";
  ctx.font = "700 14px sans-serif";
  ctx.fillText("把这张图发给好友，扫码即可报名", 28, 396);
  ctx.fillStyle = "#555555";
  ctx.font = "12px sans-serif";
  ctx.fillText("点右上角转发给微信好友，卡片可直接打开小程序。", 28, 422);
  ctx.fillText("也可保存这张图，让对方扫右侧二维码。", 28, 444);
  return canvasToFile(canvas);
}

function douyinShareText({ organizerName, title, startDate, enrolled, url, joinCode }) {
  const who = organizerName || "同行者众";
  const when = startDate ? startDate + "出发，" : "";
  const lock = String(joinCode || "").trim() ? "\n入团口令 " + String(joinCode).trim() : "";
  return (
    who +
    "邀你报名「" +
    (title || "行程") +
    "」\n" +
    when +
    "已有" +
    (enrolled || 0) +
    "人\n报名：" +
    url +
    lock +
    "\n#同行者众 #北京周边游 #户外"
  );
}

module.exports = { drawShareCard, drawSharePoster, douyinShareText };
