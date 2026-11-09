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

function drawWeatherChart(canvas, cssW, cssH, hourly, options) {
  if (!canvas || !cssW || !cssH) return;
  options = options || {};
  const dark = !!options.dark;
  const fontScale = Math.max(1, Number(options.fontScale) || 1);
  const palette = {
    line: dark ? "#c6addf" : "#785498",
    area: dark ? "rgba(198,173,223,.08)" : "rgba(120,84,152,.055)",
    rain: dark ? "rgba(198,173,223,.28)" : "rgba(120,84,152,.22)",
    label: dark ? "#d3c5df" : "#6e5c7f",
    muted: dark ? "#a29aa9" : "#8a8692",
    surface: dark ? "#1c1c1e" : "#ffffff",
    grid: dark ? "#343039" : "#eeecf2",
  };
  const dpr = (wx.getSystemInfoSync().pixelRatio || 2);
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const layout = layoutWeatherChart(hourly, cssW, cssH);
  if (!layout) return;
  const pts = layout.points;

  ctx.beginPath();
  ctx.moveTo(0, layout.baseY);
  ctx.lineTo(cssW, layout.baseY);
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 0.7;
  ctx.stroke();

  if (layout.maxPrecip > 0) {
    pts.forEach(function (p) {
      if (p.precip <= 0) return;
      const h = Math.max(2, (p.precip / layout.maxPrecip) * 18);
      ctx.fillStyle = palette.rain;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.x - 2.5, layout.baseY - h, 5, h, 2);
      else ctx.rect(p.x - 2.5, layout.baseY - h, 5, h);
      ctx.fill();
    });
  }

  strokeCatmull(ctx, pts);
  ctx.lineTo(pts[pts.length - 1].x, layout.baseY);
  ctx.lineTo(pts[0].x, layout.baseY);
  ctx.closePath();
  ctx.fillStyle = palette.area;
  ctx.fill();

  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  strokeCatmull(ctx, pts);
  ctx.stroke();

  ctx.font = Math.round(10 * fontScale) + "px sans-serif";
  ctx.textAlign = "center";
  pts.forEach(function (p) {
    if (!p.hourLabel) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = palette.surface;
    ctx.fill();
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = palette.label;
    ctx.fillText(p.temp + "°", p.x, p.y - 8);
    if (p.hourLabel) {
      ctx.fillStyle = palette.muted;
      ctx.fillText(p.hourLabel, p.x, cssH - 6);
    }
  });
}

module.exports = { drawWeatherChart };
