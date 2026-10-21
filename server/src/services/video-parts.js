const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");
const config = require("../config");

const PART_SIZE = 1024 * 1024;
const MAX_SIZE = 32 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{8,32}$/;
const KEEP_MS = 6 * 60 * 60 * 1000;

function fail(message, status) {
  const error = new Error(message);
  error.status = status || 400;
  return error;
}

function partsRoot() {
  const dir = path.join(config.dataDir, "video-parts");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionDir(id) {
  if (!ID_RE.test(String(id || ""))) throw fail("上传编号无效");
  const root = path.resolve(partsRoot());
  const dir = path.resolve(root, String(id));
  if (dir !== path.join(root, String(id))) throw fail("上传编号无效");
  return dir;
}

function readMeta(id) {
  const dir = sessionDir(id);
  const metaPath = path.join(dir, "meta.json");
  if (!fs.existsSync(metaPath)) throw fail("找不到这次上传", 404);
  return { dir, metaPath, meta: JSON.parse(fs.readFileSync(metaPath, "utf8")) };
}

function expectedSize(meta, index) {
  if (index < meta.parts - 1) return meta.partSize;
  return meta.size - meta.partSize * (meta.parts - 1);
}

function partPath(dir, index) {
  return path.join(dir, `${index}.bin`);
}

function receivedIndexes(dir, parts) {
  const have = [];
  for (let i = 0; i < parts; i += 1) {
    if (fs.existsSync(partPath(dir, i))) have.push(i);
  }
  return have;
}

function sweepSessions() {
  const root = partsRoot();
  const now = Date.now();
  for (const name of fs.readdirSync(root)) {
    if (!ID_RE.test(name)) continue;
    let created = 0;
    try {
      created = JSON.parse(fs.readFileSync(path.join(root, name, "meta.json"), "utf8")).createdAt || 0;
    } catch {
      created = 0;
    }
    if (!created || now - created > KEEP_MS) fs.rmSync(path.join(root, name), { recursive: true, force: true });
  }
}

function uploadsDir() {
  const dir = path.join(config.publicDir, "static", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function videoFileOk(filePath) {
  const fh = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(12);
    const n = fs.readSync(fh, buf, 0, 12, 0);
    return n >= 12 && buf.toString("ascii", 4, 8) === "ftyp";
  } finally {
    fs.closeSync(fh);
  }
}

function createVideoSession(size) {
  sweepSessions();
  const n = Number(size);
  if (!Number.isInteger(n) || n <= 0) throw fail("视频大小不对");
  if (n > MAX_SIZE) throw fail("视频请小于 32MB");
  const id = nanoid(12);
  const dir = sessionDir(id);
  const parts = Math.ceil(n / PART_SIZE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({
    size: n,
    parts,
    partSize: PART_SIZE,
    createdAt: Date.now(),
    url: "",
  }));
  return { id, partSize: PART_SIZE, parts, size: n };
}

function videoSessionStatus(id) {
  const { dir, meta } = readMeta(id);
  return {
    id: String(id),
    partSize: meta.partSize,
    parts: meta.parts,
    size: meta.size,
    have: receivedIndexes(dir, meta.parts),
    done: Boolean(meta.url),
    url: meta.url || "",
  };
}

function writeVideoPart(id, rawIndex, body) {
  const { dir, meta } = readMeta(id);
  if (meta.url) throw fail("这次上传已经完成");
  if (!/^\d+$/.test(String(rawIndex))) throw fail("段号不对");
  const index = Number(rawIndex);
  if (index < 0 || index >= meta.parts) throw fail("段号不对");
  const buf = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
  const expected = expectedSize(meta, index);
  if (buf.length !== expected) throw fail("这一段大小不对");
  const dest = partPath(dir, index);
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
  return { index, received: buf.length };
}

function finishVideoSession(id) {
  const { dir, metaPath, meta } = readMeta(id);
  if (meta.url) return { url: meta.url };
  const missing = [];
  for (let i = 0; i < meta.parts; i += 1) {
    if (!fs.existsSync(partPath(dir, i))) missing.push(i);
  }
  if (missing.length) throw fail(`还缺段 ${missing.join("、")}`);
  const filename = `botv-${nanoid(10)}.mp4`;
  const dest = path.join(uploadsDir(), filename);
  const tmp = `${dest}.assembling`;
  const out = fs.openSync(tmp, "w");
  try {
    for (let i = 0; i < meta.parts; i += 1) {
      const chunk = fs.readFileSync(partPath(dir, i));
      if (chunk.length !== expectedSize(meta, i)) throw fail("这一段大小不对");
      fs.writeSync(out, chunk);
    }
  } catch (error) {
    fs.closeSync(out);
    fs.rmSync(tmp, { force: true });
    throw error;
  }
  fs.closeSync(out);
  if (!videoFileOk(tmp) || fs.statSync(tmp).size !== meta.size) {
    fs.rmSync(tmp, { force: true });
    throw fail("请上传 mp4 视频");
  }
  fs.renameSync(tmp, dest);
  meta.url = `/static/uploads/${filename}`;
  fs.writeFileSync(metaPath, JSON.stringify(meta));
  for (let i = 0; i < meta.parts; i += 1) fs.rmSync(partPath(dir, i), { force: true });
  return { url: meta.url };
}

module.exports = {
  PART_SIZE,
  createVideoSession,
  videoSessionStatus,
  writeVideoPart,
  finishVideoSession,
};
