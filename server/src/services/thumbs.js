const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const config = require("../config");

const WIDTHS = new Set([360, 960]);

function thumbRel(url, width) {
  const abs = String(url || "");
  const m = abs.match(/\/static\/(photos|uploads)\/([^?#]+\.(?:jpe?g|png|webp))$/i);
  if (!m || m[2].includes("..")) return "";
  const w = WIDTHS.has(Number(width)) ? Number(width) : 360;
  const file = m[2].replace(/\.(?:jpe?g|png|webp)$/i, ".jpg");
  return `static/thumbs/${w}/${m[1]}/${file}`;
}

function thumbPublicPath(url, width) {
  const rel = thumbRel(url, width);
  if (!rel) return String(url || "");
  const pathOnly = `/${rel}`;
  const host = String(url || "").match(/^https?:\/\/[^/]+/i);
  return host ? `${host[0]}${pathOnly}` : pathOnly;
}

async function sendThumb(req, res) {
  const match = String(req.path || "").match(/^\/static\/thumbs\/(360|960)\/(.+)$/);
  const width = Number(match && match[1]);
  const rest = String((match && match[2]) || "");
  if (!WIDTHS.has(width) || !/^(photos|uploads)\/[A-Za-z0-9_./-]+\.jpg$/i.test(rest) || rest.includes("..")) {
    return res.status(404).end();
  }
  const base = rest.replace(/\.jpg$/i, "");
  const src = [".jpg", ".jpeg", ".png", ".webp"].map((ext) => path.join(config.publicDir, "static", `${base}${ext}`)).find((file) => fs.existsSync(file));
  if (!src) return res.status(404).end();
  const dest = path.join(config.publicDir, "static", "thumbs", String(width), rest);
  try {
    const srcTime = fs.statSync(src).mtimeMs;
    const fresh = fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= srcTime;
    if (!fresh) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await sharp(src)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: 72, mozjpeg: true })
        .toFile(`${dest}.part`);
      fs.renameSync(`${dest}.part`, dest);
    }
  } catch {
    return res.sendFile(src);
  }
  res.set("Cache-Control", "public, max-age=604800");
  return res.type("image/jpeg").sendFile(dest);
}

module.exports = { thumbRel, thumbPublicPath, sendThumb, WIDTHS };
