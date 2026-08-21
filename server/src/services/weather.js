const crypto = require("crypto");
const dayjs = require("dayjs");

const PLACES = [
  { match: /怀柔|慕田峪|黄花/, lat: 40.43, lon: 116.56, name: "怀柔" },
  { match: /延庆|八达岭|龙庆|古崖/, lat: 40.36, lon: 115.97, name: "延庆" },
  { match: /密云|古北|司马台|雾灵/, lat: 40.38, lon: 116.84, name: "密云" },
  { match: /房山|十渡|上方山/, lat: 39.60, lon: 115.7, name: "房山" },
  { match: /门头沟|灵山|百花|妙峰/, lat: 39.94, lon: 115.43, name: "门头沟" },
  { match: /平谷|金海|黄松峪/, lat: 40.14, lon: 117.12, name: "平谷" },
  { match: /昌平/, lat: 40.22, lon: 116.23, name: "昌平" },
  { match: /海淀|凤凰岭/, lat: 40.09, lon: 116.1, name: "海淀" },
  { match: /承德|围场|木兰/, lat: 40.97, lon: 117.94, name: "承德" },
  { match: /张家口|崇礼|张北/, lat: 40.77, lon: 114.88, name: "张家口" },
  { match: /秦皇岛|北戴河|山海关/, lat: 39.83, lon: 119.52, name: "秦皇岛" },
  { match: /赤峰|乌兰|坝上|塞罕/, lat: 42.27, lon: 116.97, name: "坝上" },
  { match: /五台|忻州/, lat: 39.0, lon: 113.6, name: "五台山" },
  { match: /天津|蓟/, lat: 40.05, lon: 117.4, name: "蓟州" },
  { match: /涞水|野三坡|白石/, lat: 39.39, lon: 115.55, name: "涞水" },
];

const WMO = {
  0: "晴",
  1: "晴间多云",
  2: "多云",
  3: "阴",
  45: "雾",
  48: "雾凇",
  51: "小毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  80: "阵雨",
  95: "雷阵雨",
};

function resolvePlace(region) {
  const text = String(region || "");
  return PLACES.find((p) => p.match.test(text)) || { lat: 39.9, lon: 116.4, name: "北京" };
}

function codeLabel(code) {
  if (WMO[code]) return WMO[code];
  if (code >= 51 && code < 70) return "降雨";
  if (code >= 71 && code < 80) return "降雪";
  if (code >= 80 && code < 90) return "阵雨";
  if (code >= 95) return "雷雨";
  return "多云";
}

function alertsFor({ weatherCode, tmax, tmin, wind, precip }) {
  const alerts = [];
  if (weatherCode >= 95) alerts.push({ level: "high", text: "有雷雨，山区请避开山脊和孤立大树" });
  else if (weatherCode >= 61 && weatherCode < 70) alerts.push({ level: "warn", text: "有雨，请带雨衣、注意山路湿滑" });
  else if (weatherCode >= 80 && weatherCode < 90) alerts.push({ level: "warn", text: "有阵雨，建议带轻量雨具" });
  if (weatherCode >= 71 && weatherCode < 80) alerts.push({ level: "warn", text: "有雪，注意防滑和保暖" });
  if (tmax >= 35) alerts.push({ level: "high", text: "高温，备足饮水、避免正午暴晒" });
  if (tmin <= 0 || tmax <= 5) alerts.push({ level: "warn", text: "气温偏低，请加穿防风层" });
  if (wind >= 40) alerts.push({ level: "warn", text: "风力较大，高处和索道行程可能受影响" });
  if (precip >= 8) alerts.push({ level: "warn", text: "降水偏多，部分步道可能积水" });
  if (!alerts.length) alerts.push({ level: "ok", text: "天气适宜出行，仍请关注临出发预报" });
  return alerts;
}

function mockDaily(region, date) {
  const seed = crypto.createHash("sha1").update(`${region}|${date}`).digest();
  const weatherCode = [0, 1, 2, 3, 61, 63, 80, 71, 95][seed[0] % 9];
  const tmax = 8 + (seed[1] % 24);
  const tmin = tmax - 6 - (seed[2] % 5);
  const wind = 8 + (seed[3] % 40);
  const precip = weatherCode >= 61 ? seed[4] % 12 : 0;
  return { weatherCode, tmax, tmin, wind, precip, source: "mock" };
}

function mockHourly(region, date, daily) {
  const seed = crypto.createHash("sha1").update(`h|${region}|${date}`).digest();
  const hours = [];
  for (let h = 6; h <= 20; h++) {
    const t = (h - 6) / 14;
    const temp = Math.round(daily.tmin + (daily.tmax - daily.tmin) * Math.sin(Math.PI * t));
    const wet = daily.weatherCode >= 61 && seed[h % seed.length] % 3 === 0;
    hours.push({
      hour: `${String(h).padStart(2, "0")}:00`,
      summary: wet ? codeLabel(daily.weatherCode) : codeLabel(Math.min(daily.weatherCode, 3)),
      temp,
      precip: wet ? Math.max(0.2, Number(daily.precip || 0) / 6) : 0,
    });
  }
  return hours;
}

function hourlyFromLive(json) {
  const h = json.hourly || {};
  const times = h.time || [];
  const codes = h.weathercode || h.weather_code || [];
  const temps = h.temperature_2m || [];
  const precips = h.precipitation || [];
  const out = [];
  for (let i = 0; i < times.length; i += 1) {
    const hour = String(times[i] || "").slice(11, 16);
    const n = Number(hour.slice(0, 2));
    if (n < 6 || n > 20) continue;
    out.push({
      hour,
      summary: codeLabel(Number(codes[i] || 1)),
      temp: Math.round(Number(temps[i] || 0)),
      precip: Number(precips[i] || 0),
    });
  }
  return out;
}

async function liveDaily(lat, lon, date) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&hourly=weathercode,temperature_2m,precipitation&timezone=Asia%2FShanghai&start_date=${date}&end_date=${date}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error("weather http " + res.status);
  const json = await res.json();
  const d = json.daily || {};
  return {
    weatherCode: Number(d.weathercode?.[0] || 1),
    tmax: Number(d.temperature_2m_max?.[0] || 18),
    tmin: Number(d.temperature_2m_min?.[0] || 10),
    wind: Number(d.windspeed_10m_max?.[0] || 10),
    precip: Number(d.precipitation_sum?.[0] || 0),
    source: "open-meteo",
    hourly: hourlyFromLive(json),
  };
}

async function forecast({ region, date }) {
  const day = dayjs(date || undefined).isValid() ? dayjs(date).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
  const place = resolvePlace(region);
  let daily;
  if (process.env.WEATHER_LIVE === "1") {
    try {
      daily = await liveDaily(place.lat, place.lon, day);
    } catch {
      daily = mockDaily(region || place.name, day);
    }
  } else {
    daily = mockDaily(region || place.name, day);
  }
  const summary = codeLabel(daily.weatherCode);
  const hourly = Array.isArray(daily.hourly) && daily.hourly.length ? daily.hourly : mockHourly(region || place.name, day, daily);
  return {
    date: day,
    region: region || place.name,
    place: place.name,
    lat: place.lat,
    lon: place.lon,
    summary,
    tmax: daily.tmax,
    tmin: daily.tmin,
    wind: daily.wind,
    precip: daily.precip,
    source: daily.source,
    alerts: alertsFor(daily),
    hourly,
  };
}

module.exports = { forecast, resolvePlace, alertsFor, mockDaily };
