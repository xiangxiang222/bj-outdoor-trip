function loadImage(src) {
  if (!src || typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
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
  return Number.isFinite(v) ? Math.round(v) : 0;
}

export function posterDataUrl(svg) {
  if (!svg) return "";
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function drawTripPoster(facts, qrSrc) {
  const width = 750;
  const height = 980;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const cover = await loadImage(facts.coverEmbed || facts.cover);
  if (cover) {
    const ratio = Math.max(width / cover.width, 360 / cover.height);
    const cw = cover.width * ratio;
    const ch = cover.height * ratio;
    ctx.drawImage(cover, (width - cw) / 2, (360 - ch) / 2, cw, ch);
  } else {
    ctx.fillStyle = "#1b4332";
    ctx.fillRect(0, 0, width, 360);
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 360, width, 620);

  roundRect(ctx, 28, 384, 72, 28, 14);
  ctx.fillStyle = "#1b4332";
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "700 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(facts.kindLabel || "个人", 64, 404);
  ctx.textAlign = "left";
  ctx.fillStyle = "#111";
  ctx.font = "800 28px sans-serif";
  ctx.fillText(String(facts.title || "行程").slice(0, 16), 112, 406);

  if (facts.free) {
    ctx.fillStyle = "#1b4332";
    ctx.font = "800 36px sans-serif";
    ctx.fillText("免费", 28, 548);
  } else {
    ctx.fillStyle = "#888";
    ctx.font = "13px sans-serif";
    ctx.fillText("原价", 28, 508);
    ctx.fillText("会员", 108, 508);
    ctx.fillText("学生", 188, 508);
    ctx.fillStyle = "#c2410c";
    ctx.font = "800 32px sans-serif";
    ctx.fillText(`¥${yuan(facts.originPrice)}`, 28, 548);
    ctx.font = "700 22px sans-serif";
    ctx.fillText(`¥${yuan(facts.memberPrice)}`, 148, 548);
    ctx.fillText(`¥${yuan(facts.studentPrice)}`, 248, 548);
  }

  ctx.fillStyle = "#888";
  ctx.font = "18px sans-serif";
  ctx.fillText("时间", 28, 610);
  ctx.fillText("集合", 28, 656);
  ctx.fillText("人数", 28, 702);
  ctx.fillText("发起", 28, 748);
  ctx.fillStyle = "#111";
  ctx.font = "700 22px sans-serif";
  ctx.fillText(`${facts.startDate || ""} ${facts.meetupTime || ""}`.trim(), 92, 610);
  ctx.fillText(String(facts.meetupPoint || "").slice(0, 16), 92, 656);
  ctx.font = "600 20px sans-serif";
  ctx.fillText(`已报名 ${facts.enrolled || 0}/${facts.maxSeats || 0}，最低成团 ${facts.minGroup || 0}`, 92, 702);
  ctx.fillStyle = "#1b4332";
  ctx.fillText(facts.organizerName || "同行者众", 92, 748);

  const qr = await loadImage(qrSrc);
  if (qr) ctx.drawImage(qr, 528, 430, 190, 190);
  ctx.fillStyle = "#c2410c";
  ctx.font = "700 18px sans-serif";
  ctx.fillText("扫码报名", 548, 418);

  roundRect(ctx, 28, 790, 694, 150, 18);
  ctx.fillStyle = "#f4efe6";
  ctx.fill();
  ctx.fillStyle = "#1b4332";
  ctx.font = "700 22px sans-serif";
  ctx.fillText(`好友报名，分享人得团费 ${Math.round(Number(facts.rate || 0.05) * 100)}%`, 52, 838);
  ctx.fillStyle = "#555";
  ctx.font = "16px sans-serif";
  ctx.fillText("微信里转发给好友或群，点卡片进小程序报名。", 52, 878);
  ctx.fillText("也可以保存这张图，让对方扫右侧二维码。", 52, 910);

  return canvas;
}

export async function downloadPosterPng(canvas, filename) {
  const name = filename || "trip-share.png";
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("无法生成图片"))), "image/png");
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
