const WEEK = ["Sun.周日", "Mon.周一", "Tue.周二", "Wed.周三", "Thu.周四", "Fri.周五", "Sat.周六"];
const W = 750;
const HEADER = 214;
const ITEM_H = 144;
const FOOTER = 156;
const QR_FOOTER = 300;
const QR_SIZE = 148;
const PAD = 40;
const DATE_COL = 176;

function clip(raw, max) {
  const text = String(raw || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function coverFrom(row) {
  const gallery = row?.gallery || row?.route?.gallery || [];
  const first = gallery[0];
  if (typeof first === "string" && first) return first;
  if (first && typeof first === "object") return first.src || first.url || first.thumb || "";
  return row?.route?.cover || row?.cover || "";
}

function dateBits(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { md: String(iso || "").slice(5), week: "" };
  return {
    md: `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`,
    week: WEEK[d.getDay()],
  };
}

function placeTitle(city) {
  const name = String(city || "").replace(/(市|区)$/, "").trim();
  if (!name) return "北京周边徒步";
  return `${name}徒步活动`;
}

function statsLine(route) {
  const bits = [];
  const km = Number(route.distanceKm) || 0;
  const days = Number(route.days) || 0;
  if (km > 0) bits.push(`距离 ${km}KM`);
  if (days > 1) bits.push(`${days}日`);
  if (bits.length) return `路线  ${bits.join(" | ")}`;
  return route.category ? `路线  ${route.category}` : "";
}

function pitchLine(route) {
  const text = String(route.subtitle || "").trim();
  if (text) return `看点  「${clip(text, 16)}」`;
  return route.category ? `看点  ${route.category}` : "";
}

export function buildLineup(trips, options = {}) {
  const list = (Array.isArray(trips) ? trips : [])
    .filter((row) => row && row.route && String(row.route.title || "").trim() && row.startDate)
    .slice(0, 6);
  const meets = [];
  for (const row of list) {
    const name = clip(row.meetupPoint, 10);
    if (name && !meets.includes(name)) meets.push(name);
    if (meets.length >= 3) break;
  }
  const groups = [];
  for (const row of list) {
    const date = String(row.startDate);
    let group = groups.find((item) => item.date === date);
    if (!group) {
      group = { date, ...dateBits(date), items: [] };
      groups.push(group);
    }
    const route = row.route;
    group.items.push({
      difficulty: route.difficulty || "休闲",
      title: clip(route.title, 10),
      stats: statsLine(route),
      pitch: pitchLine(route),
    });
  }
  return {
    title: placeTitle(options.city),
    subtitle: clip(meets.length ? `——${meets.join("、")}集合` : "——周末进山，先看好集合点", 20),
    cover: list.map(coverFrom).find(Boolean) || "",
    groups,
    count: list.length,
  };
}

export function lineupHeight(model) {
  const items = (model?.groups || []).reduce((sum, group) => sum + group.items.length, 0);
  const footer = model?.qr ? QR_FOOTER : FOOTER;
  return Math.max(980, HEADER + items * ITEM_H + footer);
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

function posterImageSrc(src) {
  const match = String(src || "").match(/\/static\/[^?#]+/);
  return match ? match[0] : src;
}

function loadImage(src) {
  const url = posterImageSrc(src);
  if (!url || typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    if (/^https?:/i.test(url)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawCover(ctx, img, w, h) {
  if (!img) {
    ctx.fillStyle = "#1c3330";
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const ratio = Math.max(w / img.width, h / img.height);
  const cw = img.width * ratio;
  const ch = img.height * ratio;
  ctx.drawImage(img, (w - cw) / 2, (h - ch) / 2, cw, ch);
}

function drawChip(ctx, x, y, text, fill) {
  ctx.font = "700 22px PingFang SC, sans-serif";
  const width = Math.min(ctx.measureText(text).width + 28, W - x - PAD);
  roundRect(ctx, x, y, width, 40, 7);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = "#1c2410";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 14, y + 21, width - 24);
  ctx.textBaseline = "top";
}

function drawMark(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 30, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "800 26px PingFang SC, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("众", x, y + 1);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#fff";
  ctx.font = "700 18px PingFang SC, sans-serif";
  ctx.fillText("同行者众", x, y + 40);
  ctx.textAlign = "left";
}

function drawSearch(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x - 3, y - 3, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 3, y + 3);
  ctx.lineTo(x + 10, y + 10);
  ctx.stroke();
  ctx.restore();
}

function drawFooter(ctx, height, qr) {
  const rowY = qr ? height - 72 - QR_SIZE + (QR_SIZE - 62) / 2 : height - 108;
  ctx.fillStyle = "#fff";
  ctx.font = "700 26px PingFang SC, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("报名方式", PAD, rowY + 16);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD + 118, rowY + 28);
  ctx.quadraticCurveTo(PAD + 150, rowY + 8, PAD + 176, rowY + 28);
  ctx.stroke();
  ctx.font = "700 28px PingFang SC, sans-serif";
  const label = "同行者众";
  const labelW = ctx.measureText(label).width;
  const pillX = PAD + 196;
  const pillW = labelW + 96;
  roundRect(ctx, pillX, rowY, pillW, 62, 31);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.fillText(label, pillX + 26, rowY + 16);
  drawSearch(ctx, pillX + pillW - 36, rowY + 31);
  if (!qr) return;
  const qrX = W - PAD - QR_SIZE;
  const qrY = height - 72 - QR_SIZE;
  roundRect(ctx, qrX - 12, qrY - 12, QR_SIZE + 24, QR_SIZE + 24, 20);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.drawImage(qr, qrX, qrY, QR_SIZE, QR_SIZE);
  ctx.fillStyle = "#fff";
  ctx.font = "700 22px PingFang SC, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("扫码看这批团", qrX + QR_SIZE / 2, qrY + QR_SIZE + 18);
  ctx.textAlign = "left";
}

export async function drawLineupPoster(model) {
  const height = lineupHeight(model);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "top";
  const cover = await loadImage(model.cover);
  const qr = await loadImage(model.qr);
  drawCover(ctx, cover, W, height);
  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, "rgba(12, 22, 20, 0.42)");
  shade.addColorStop(0.42, "rgba(10, 18, 16, 0.62)");
  shade.addColorStop(1, "rgba(6, 12, 11, 0.82)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, height);

  ctx.fillStyle = "#fff";
  ctx.font = "800 58px PingFang SC, sans-serif";
  ctx.fillText(model.title, PAD, 48);
  ctx.font = "500 24px PingFang SC, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(model.subtitle, PAD, 122);
  drawMark(ctx, W - 78, 62);

  const contentX = PAD + DATE_COL;
  let y = HEADER;
  const ruleTop = HEADER + 8;
  for (const group of model.groups) {
    const blockTop = y;
    ctx.fillStyle = "#fff";
    ctx.font = "800 52px PingFang SC, sans-serif";
    ctx.fillText(group.md, PAD, blockTop);
    ctx.font = "700 18px PingFang SC, sans-serif";
    const weekW = ctx.measureText(group.week).width + 18;
    roundRect(ctx, PAD, blockTop + 64, weekW, 32, 6);
    ctx.fillStyle = "#d6ef4a";
    ctx.fill();
    ctx.fillStyle = "#1c2410";
    ctx.fillText(group.week, PAD + 9, blockTop + 70);
    for (const item of group.items) {
      ctx.fillStyle = "#fff";
      ctx.font = "800 32px PingFang SC, sans-serif";
      ctx.fillText(`${item.difficulty}  |  ${item.title}`, contentX, y + 2);
      if (item.stats) drawChip(ctx, contentX, y + 46, item.stats, "#d6ef4a");
      if (item.pitch) drawChip(ctx, contentX, y + 92, item.pitch, "#e7f58a");
      y += ITEM_H;
    }
  }
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD + DATE_COL - 28, ruleTop);
  ctx.lineTo(PAD + DATE_COL - 28, y - 16);
  ctx.stroke();
  drawFooter(ctx, height, qr);
  return canvas;
}
