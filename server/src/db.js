const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("./config");

function ensureDirs() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(path.join(config.publicDir, "static", "routes"), { recursive: true });
  fs.mkdirSync(path.join(config.publicDir, "static", "uploads"), { recursive: true });
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE,
      password_hash TEXT,
      nickname TEXT,
      avatar TEXT,
      gender TEXT,
      birthday TEXT,
      id_card TEXT,
      hometown TEXT,
      wechat_openid TEXT,
      wechat_unionid TEXT,
      is_member INTEGER DEFAULT 0,
      member_expire_at TEXT,
      points INTEGER DEFAULT 0,
      company_name TEXT,
      role TEXT DEFAULT 'user',
      deleted_at TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      name TEXT,
      role TEXT DEFAULT 'admin',
      status TEXT DEFAULT 'on',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS sms_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT,
      code TEXT,
      scene TEXT,
      expire_at TEXT,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS captchas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE,
      code TEXT,
      expire_at TEXT,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS bus_types (
      id TEXT PRIMARY KEY,
      name TEXT,
      seats INTEGER,
      description TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      title TEXT,
      subtitle TEXT,
      days INTEGER,
      distance_km INTEGER,
      difficulty TEXT,
      category TEXT,
      region TEXT,
      season TEXT,
      tags_json TEXT,
      cover TEXT,
      gallery_json TEXT,
      min_group_size INTEGER,
      description TEXT,
      highlights_json TEXT,
      itinerary_json TEXT,
      fee_include TEXT,
      fee_exclude TEXT,
      equipment TEXT,
      notices TEXT,
      meetup_json TEXT,
      status TEXT DEFAULT 'on',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS route_price_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER,
      min_people INTEGER,
      max_people INTEGER,
      price INTEGER,
      member_price INTEGER
    );

    CREATE TABLE IF NOT EXISTS route_buses (
      route_id INTEGER,
      bus_type_id TEXT
    );

    CREATE TABLE IF NOT EXISTS guides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT,
      gender TEXT,
      years INTEGER,
      languages TEXT,
      specialties TEXT,
      rating REAL DEFAULT 4.8,
      avatar TEXT,
      bio TEXT,
      status TEXT DEFAULT 'idle'
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER,
      start_date TEXT,
      end_date TEXT,
      organizer_type TEXT,
      organizer_id INTEGER,
      organizer_name TEXT,
      company_name TEXT,
      bus_type_id TEXT,
      min_group_size INTEGER,
      max_seats INTEGER,
      meetup_point TEXT,
      meetup_time TEXT,
      status TEXT DEFAULT 'recruiting',
      share_token TEXT UNIQUE,
      notes TEXT,
      cancel_reason TEXT,
      cancelled_at TEXT,
      cancelled_by TEXT,
      cancelled_by_id INTEGER,
      cost_transport INTEGER DEFAULT 0,
      cost_ticket INTEGER DEFAULT 0,
      cost_hotel INTEGER DEFAULT 0,
      cost_meal INTEGER DEFAULT 0,
      cost_guide INTEGER DEFAULT 0,
      cost_other INTEGER DEFAULT 0,
      guide_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER,
      user_id INTEGER,
      traveler_name TEXT,
      traveler_phone TEXT,
      id_card TEXT,
      gender TEXT,
      birthday TEXT,
      hometown TEXT,
      traveler_type TEXT DEFAULT 'adult',
      pay_status TEXT,
      pay_amount INTEGER DEFAULT 0,
      points_used INTEGER DEFAULT 0,
      pay_channel TEXT,
      join_mode TEXT DEFAULT 'chain',
      status TEXT DEFAULT 'joined',
      waitlisted_at TEXT,
      promoted_at TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enrollment_id INTEGER,
      user_id INTEGER,
      schedule_id INTEGER,
      amount INTEGER,
      channel TEXT,
      status TEXT,
      trade_no TEXT,
      wechat_prepay_id TEXT,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS points_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      delta INTEGER,
      balance INTEGER,
      reason TEXT,
      ref_type TEXT,
      ref_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER,
      route_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (user_id, route_id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER,
      user_id INTEGER,
      rating INTEGER,
      content TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS sms_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT,
      scene TEXT,
      content TEXT,
      status TEXT,
      ref_type TEXT,
      ref_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
}

function addColumnIfMissing(db, table, name, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
}

function migrateSchema(db) {
  addColumnIfMissing(db, "schedules", "cancel_reason", "TEXT");
  addColumnIfMissing(db, "schedules", "cancelled_at", "TEXT");
  addColumnIfMissing(db, "schedules", "cancelled_by", "TEXT");
  addColumnIfMissing(db, "schedules", "cancelled_by_id", "INTEGER");
  addColumnIfMissing(db, "users", "deleted_at", "TEXT");
  addColumnIfMissing(db, "admin_users", "status", "TEXT DEFAULT 'on'");
  addColumnIfMissing(db, "enrollments", "waitlisted_at", "TEXT");
  addColumnIfMissing(db, "enrollments", "promoted_at", "TEXT");
}

let _db;
function getDb() {
  if (_db) return _db;
  ensureDirs();
  _db = new Database(config.dbFile);
  createSchema(_db);
  migrateSchema(_db);
  return _db;
}

function toRoute(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    subtitle: row.subtitle,
    days: row.days,
    distanceKm: row.distance_km,
    difficulty: row.difficulty,
    category: row.category,
    region: row.region,
    season: row.season,
    tags: JSON.parse(row.tags_json || "[]"),
    cover: row.cover,
    gallery: JSON.parse(row.gallery_json || "[]"),
    minGroupSize: row.min_group_size,
    description: row.description,
    highlights: JSON.parse(row.highlights_json || "[]"),
    itinerary: JSON.parse(row.itinerary_json || "[]"),
    feeInclude: row.fee_include,
    feeExclude: row.fee_exclude,
    equipment: row.equipment,
    notices: row.notices,
    meetupPoints: JSON.parse(row.meetup_json || "[]"),
    status: row.status,
    ...extra,
  };
}

function resetDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { getDb, toRoute, ensureDirs, resetDb, createSchema };
