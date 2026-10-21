const { nanoid } = require("nanoid");
const QRCode = require("qrcode");
const { getDb } = require("../db");
const { publicBase } = require("./helpers");
const { loginLive, getWxaCode } = require("./wechat");

const CODE_RE = /^[A-Za-z0-9_-]{8,16}$/;
const PAGE = "pages/lineup/lineup";

function wantedIds(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const unique = [];
  list.forEach((item) => {
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0 || unique.includes(id)) return;
    unique.push(id);
  });
  if (!unique.length || unique.length > 6) return null;
  return unique;
}

function visibleIds(db, ids) {
  const marks = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id FROM schedules WHERE id IN (${marks})
       AND start_date>=date('now','localtime') AND status!='cancelled' AND IFNULL(review_status,'approved')='approved'
       AND (
         IFNULL(channel,'trip')='activity'
         OR route_id IN (SELECT id FROM routes WHERE IFNULL(status,'on')='on' AND IFNULL(review_status,'approved')='approved')
       )`
    )
    .all(...ids);
  const ok = new Set(rows.map((row) => Number(row.id)));
  const kept = ids.filter((id) => ok.has(id));
  if (kept.length !== ids.length) return null;
  return kept;
}

async function qrImage(code, req) {
  if (loginLive()) {
    try {
      const buf = await getWxaCode({ scene: code, page: PAGE });
      if (buf && buf.length > 40) return `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      /* 小程序码失败时退回网页二维码 */
    }
  }
  return QRCode.toDataURL(`${publicBase(req)}/m/lineup/${encodeURIComponent(code)}`, { margin: 1, width: 280 });
}

async function createPosterLineup(rawIds, req) {
  const ids = wantedIds(rawIds);
  const db = getDb();
  const kept = ids && visibleIds(db, ids);
  if (!kept) {
    const err = new Error("这些团不能放进海报");
    err.status = 400;
    throw err;
  }
  const key = kept.slice().sort((a, b) => a - b).join(",");
  let row = db.prepare("SELECT code, ids_json FROM poster_lineups WHERE ids_key=?").get(key);
  if (!row) {
    const code = nanoid(10);
    db.prepare("INSERT INTO poster_lineups (code, ids_key, ids_json) VALUES (?,?,?)").run(code, key, JSON.stringify(kept));
    row = { code, ids_json: JSON.stringify(kept) };
  }
  return {
    code: row.code,
    ids: JSON.parse(row.ids_json),
    qr: await qrImage(row.code, req),
  };
}

function lineupSchedules(code) {
  if (!CODE_RE.test(String(code || ""))) return null;
  const row = getDb().prepare("SELECT code, ids_json FROM poster_lineups WHERE code=?").get(code);
  if (!row) return null;
  let ids = [];
  try {
    ids = JSON.parse(row.ids_json);
  } catch {
    return null;
  }
  if (!Array.isArray(ids)) return null;
  const db = getDb();
  const rows = ids
    .map((id) => Number(id))
    .filter((id) => id > 0)
    .map((id) =>
      db
        .prepare(
          `SELECT * FROM schedules WHERE id=? AND status!='cancelled' AND IFNULL(review_status,'approved')='approved'
           AND (
             IFNULL(channel,'trip')='activity'
             OR route_id IN (SELECT id FROM routes WHERE IFNULL(status,'on')='on' AND IFNULL(review_status,'approved')='approved')
           )`
        )
        .get(id)
    )
    .filter(Boolean);
  return { code: row.code, rows };
}

module.exports = { createPosterLineup, lineupSchedules };
