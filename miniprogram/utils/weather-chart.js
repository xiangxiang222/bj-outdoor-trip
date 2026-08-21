function layoutWeatherChart(hourly, width, height) {
  const pad = { l: 14, r: 14, t: 28, b: 24 };
  const hours = (hourly || []).filter(function (h) {
    return h && h.hour != null && isFinite(Number(h.temp));
  });
  if (!hours.length) return null;
  const temps = hours.map(function (h) { return Number(h.temp); });
  const tmin = Math.min.apply(null, temps);
  const tmax = Math.max.apply(null, temps);
  const span = Math.max(2, tmax - tmin + 2);
  const n = hours.length;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const points = hours.map(function (h, i) {
    const hour = String(h.hour);
    const hh = Number(hour.slice(0, 2));
    const x = pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = pad.t + (1 - (Number(h.temp) - (tmin - 1)) / span) * innerH;
    return {
      x: x,
      y: y,
      temp: Math.round(Number(h.temp)),
      hour: hour,
      hourLabel: i === 0 || i === n - 1 || hh % 3 === 0 ? String(hh).padStart(2, "0") : "",
      precip: Number(h.precip || 0),
    };
  });
  const maxPrecip = Math.max(0, Math.max.apply(null, points.map(function (p) { return p.precip; })));
  return { points: points, baseY: height - pad.b, maxPrecip: maxPrecip, width: width, height: height };
}

function strokeCatmull(ctx, pts) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y
    );
  }
}

function drawWeatherChart(canvas, cssW, cssH, hourly) {
  if (!canvas || !cssW || !cssH) return;
  const dpr = (wx.getSystemInfoSync().pixelRatio || 2);
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const layout = layoutWeatherChart(hourly, cssW, cssH);
  if (!layout) return;
  const pts = layout.points;

  if (layout.maxPrecip > 0) {
    pts.forEach(function (p) {
      const h = Math.max(2, (p.precip / layout.maxPrecip) * 28);
      ctx.fillStyle = "rgba(142, 202, 230, 0.55)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.x - 4, layout.baseY - h, 8, h, 2);
      else ctx.rect(p.x - 4, layout.baseY - h, 8, h);
      ctx.fill();
    });
  }

  strokeCatmull(ctx, pts);
  ctx.lineTo(pts[pts.length - 1].x, layout.baseY);
  ctx.lineTo(pts[0].x, layout.baseY);
  ctx.closePath();
  ctx.fillStyle = "rgba(58, 124, 165, 0.18)";
  ctx.fill();

  ctx.strokeStyle = "#3a7ca5";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  strokeCatmull(ctx, pts);
  ctx.stroke();

  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  pts.forEach(function (p) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#3a7ca5";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = "#1b4332";
    ctx.fillText(p.temp + "°", p.x, p.y - 8);
    if (p.hourLabel) {
      ctx.fillStyle = "#6b705c";
      ctx.fillText(p.hourLabel, p.x, cssH - 6);
    }
  });
}

module.exports = { drawWeatherChart };
