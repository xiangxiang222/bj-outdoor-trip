const crypto = require("crypto");
const { getDb } = require("../db");
const legal = require("./legal");

// This acceptance never substitutes for a separate sensitive-data, third-party
// disclosure, public-disclosure or cross-border consent.
const SCOPE = "user_agreement_and_privacy_policy";

function fail(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function snapshotOf(bundle) {
  const json = JSON.stringify(canonical(bundle));
  return { json, hash: crypto.createHash("sha256").update(json).digest("hex") };
}

function assertVersionContents(version, hash) {
  const archived = getDb().prepare("SELECT snapshot_sha256 FROM legal_versions WHERE version=?").get(version);
  if (archived && archived.snapshot_sha256 !== hash) {
    fail(409, "legal_version_conflict", "协议内容已变更，请稍后刷新协议后重试");
  }
}

function validateConsent(input) {
  const bundle = legal.legalBundle();
  if (bundle.status !== "published") return null;
  if (!input || typeof input !== "object" || Array.isArray(input) || input.accepted !== true) {
    fail(400, "legal_consent_required", "请阅读并同意用户协议和隐私政策");
  }
  if (typeof input.version !== "string" || input.version !== bundle.version) {
    fail(409, "legal_version_changed", "协议版本已更新，请重新阅读并确认");
  }
  const snapshot = snapshotOf(bundle);
  assertVersionContents(bundle.version, snapshot.hash);
  return { version: bundle.version, snapshot };
}

function recordConsent(userId, accepted, channel) {
  if (!accepted) return;
  const db = getDb();
  db.transaction(() => {
    assertVersionContents(accepted.version, accepted.snapshot.hash);
    const now = new Date().toISOString();
    db.prepare("INSERT OR IGNORE INTO legal_versions(version,snapshot_json,snapshot_sha256,archived_at) VALUES(?,?,?,?)")
      .run(accepted.version, accepted.snapshot.json, accepted.snapshot.hash, now);
    db.prepare("INSERT OR IGNORE INTO legal_consents(user_id,version,scope,channel,accepted_at) VALUES(?,?,?,?,?)")
      .run(userId, accepted.version, SCOPE, channel, now);
  })();
}

function consentGate(channel, { allowBinding = false } = {}) {
  return (req, res, next) => {
    // The existing signed-in WeChat endpoint also binds an account before a
    // payment. This branch cannot create a user and is not a new login consent.
    if (allowBinding && req.userId && !Object.hasOwn(req.body || {}, "legalConsent")) return next();
    try {
      const accepted = validateConsent((req.body || {}).legalConsent);
      if (accepted) {
        const send = res.json.bind(res);
        res.json = (body) => {
          if (res.statusCode < 400 && body && body.ok && body.data?.token && body.data?.user?.id) {
            try {
              recordConsent(body.data.user.id, accepted, channel);
            } catch (error) {
              res.status(error.status || 503);
              return send({ ok: false, code: error.code || "legal_consent_unavailable", message: error.status ? error.message : "协议确认暂时无法保存，请稍后重试" });
            }
          }
          return send(body);
        };
      }
      next();
    } catch (error) {
      res.status(error.status || 503).json({ ok: false, code: error.code || "legal_consent_unavailable", message: error.status ? error.message : "协议暂不可用，请稍后重试" });
    }
  };
}

function smsConsentGate(req, res, next) {
  if ((req.body || {}).scene === "guide") return next();
  return consentGate("sms")(req, res, next);
}

module.exports = { SCOPE, snapshotOf, validateConsent, recordConsent, consentGate, smsConsentGate };
