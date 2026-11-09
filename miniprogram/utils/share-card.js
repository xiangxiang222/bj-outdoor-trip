// Canvas 2D needs an Image created by this canvas, not a getImageInfo path.
// Bound downloads/decoding so a share can finish within WeChat's 3s deadline.
const FALLBACK_SHARE_CARD = "/images/share-card.png";
const IMAGE_TIMEOUT = 1200;
// Canvas 2D has a 1365px limit per edge, including the device pixel ratio.
const MAX_CANVAS_EDGE = 1365;

function loadCover(canvas, src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    let done = false;
    const timer = setTimeout(() => finish(null), IMAGE_TIMEOUT);
    function finish(image) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(image);
    }
    function decode(path) {
      if (done) return;
      try {
        const image = canvas.createImage();
        image.onload = () => finish(image);
        image.onerror = () => finish(null);
        image.src = path;
      } catch (e) { finish(null); }
    }
    // Poster QR codes are returned as data URLs, which getImageInfo cannot download.
    if (/^data:image\//i.test(src)) return decode(src);
    wx.getImageInfo({
      src,
      success: (res) => decode(res.path),
      fail: () => finish(null),
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
  // Paint a visible background even if a device cannot draw the source image.
  ctx.fillStyle = "#1b4332";
  ctx.fillRect(x, y, w, h);
  if (cover && cover.width && cover.height) {
    try {
      const scale = Math.max(w / cover.width, h / cover.height);
      const sw = w / scale;
      const sh = h / scale;
      ctx.drawImage(cover, (cover.width - sw) / 2, (cover.height - sh) / 2, sw, sh, x, y, w, h);
      return;
    } catch (e) {
      /* fallback block */
    }
  }
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 26px sans-serif";
  ctx.fillText("同行者众 · 一起出发", x + 24, y + h / 2);
}

function canvasToFile(canvas) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      destWidth: canvas.width,
      destHeight: canvas.height,
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
        const deviceDpr = Math.max(1, Number(wx.getSystemInfoSync().pixelRatio) || 1);
        const dpr = Math.min(deviceDpr, 2, MAX_CANVAS_EDGE / Math.max(cssW, cssH));
        node.width = cssW * dpr;
        node.height = cssH * dpr;
        const ctx = node.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        resolve({ canvas: node, ctx });
      });
  });
}

function queueCanvas(page, id, draw) {
  const jobs = page._shareCanvasJobs || (page._shareCanvasJobs = {});
  const task = (jobs[id] || Promise.resolve()).catch(() => {}).then(draw);
  jobs[id] = task.catch(() => {});
  return task;
}

function drawShareCard(page, facts) {
  return queueCanvas(page, "card", () => renderShareCard(page, facts));
}

async function renderShareCard(page, facts) {
  const w = 500;
  const h = 400;
  const { canvas, ctx } = await getCanvas(page, "#shareCardCanvas", w, h);
  const cover = await loadCover(canvas, facts.cover);
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

function drawSharePoster(page, facts, qrSrc) {
  return queueCanvas(page, "poster", () => renderSharePoster(page, facts, qrSrc));
}

async function renderSharePoster(page, facts, qrSrc) {
  const w = 375;
  const h = 490;
  const { canvas, ctx } = await getCanvas(page, "#sharePosterCanvas", w, h);
  const [cover, qr] = await Promise.all([loadCover(canvas, facts.cover), loadCover(canvas, qrSrc)]);
  if (!qr) throw new Error("poster QR image unavailable");
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
  ctx.drawImage(qr, 250, 220, 110, 110);
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

module.exports = { drawShareCard, drawSharePoster, FALLBACK_SHARE_CARD };
