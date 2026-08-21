const PAD = { l: 14, r: 14, t: 28, b: 24 };

export function layoutWeatherChart(hourly, width = 360, height = 148, pad = PAD) {
  const hours = (hourly || []).filter((h) => h && h.hour != null && Number.isFinite(Number(h.temp)));
  if (!hours.length) return null;
  const temps = hours.map((h) => Number(h.temp));
  const tmin = Math.min(...temps);
  const tmax = Math.max(...temps);
  const span = Math.max(2, tmax - tmin + 2);
  const n = hours.length;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const points = hours.map((h, i) => {
    const hour = String(h.hour);
    const hh = Number(hour.slice(0, 2));
    const x = pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = pad.t + (1 - (Number(h.temp) - (tmin - 1)) / span) * innerH;
    return {
      x,
      y,
      temp: Math.round(Number(h.temp)),
      hour,
      hourLabel: i === 0 || i === n - 1 || hh % 3 === 0 ? String(hh).padStart(2, "0") : "",
      precip: Number(h.precip || 0),
    };
  });
  const line = catmullPath(points);
  const baseY = height - pad.b;
  const area = `${line} L ${points[points.length - 1].x} ${baseY} L ${points[0].x} ${baseY} Z`;
  const maxPrecip = Math.max(0, ...points.map((p) => p.precip));
  return { points, line, area, baseY, maxPrecip, width, height, pad };
}

export function catmullPath(pts) {
  if (!pts.length) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`;
  }
  return d;
}

export function strokeCatmull(ctx, pts) {
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
      p2.y,
    );
  }
}
