const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("./config");
const { backfillBusPhotos } = require("./seed/bus-art");

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
      member_gift_left INTEGER DEFAULT 0,
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
      photo TEXT,
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
      plate_no TEXT,
      bus_photo TEXT,
      locked_seats TEXT DEFAULT '[]',
      consult_group TEXT,
      offer_type TEXT DEFAULT 'full',
      offer_price INTEGER,
      review_status TEXT DEFAULT 'approved',
      play_tags_json TEXT DEFAULT '[]',
      city TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS play_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      color TEXT,
      cover TEXT,
      sort_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'on'
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
      seat_no TEXT,
      insurance_code TEXT DEFAULT 'none',
      insurance_fee INTEGER DEFAULT 0,
      checkin_at TEXT,
      checkin_by INTEGER,
      emergency_name TEXT,
      emergency_phone TEXT,
      waiver_accepted_at TEXT,
      health_declared_at TEXT,
      coupon_id INTEGER,
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

    CREATE TABLE IF NOT EXISTS payment_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER,
      party TEXT,
      name TEXT,
      amount INTEGER,
      rate REAL,
      status TEXT,
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
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(user_id, schedule_id)
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

    CREATE TABLE IF NOT EXISTS coupon_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      schedule_id INTEGER,
      name TEXT,
      kind TEXT,
      value INTEGER,
      cap_amount INTEGER DEFAULT 0,
      floor_price INTEGER DEFAULT 0,
      total INTEGER,
      claimed INTEGER DEFAULT 0,
      per_user_limit INTEGER DEFAULT 1,
      claim_start TEXT,
      claim_end TEXT,
      use_start TEXT,
      use_end TEXT,
      audience TEXT DEFAULT 'public',
      status TEXT DEFAULT 'on',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS user_coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      user_id INTEGER,
      code TEXT UNIQUE,
      status TEXT DEFAULT 'unused',
      used_enrollment_id INTEGER,
      used_at TEXT,
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
  addColumnIfMissing(db, "enrollments", "seat_no", "TEXT");
  addColumnIfMissing(db, "enrollments", "insurance_code", "TEXT DEFAULT 'none'");
  addColumnIfMissing(db, "enrollments", "insurance_fee", "INTEGER DEFAULT 0");
  addColumnIfMissing(db, "enrollments", "checkin_at", "TEXT");
  addColumnIfMissing(db, "enrollments", "checkin_by", "INTEGER");
  addColumnIfMissing(db, "enrollments", "emergency_name", "TEXT");
  addColumnIfMissing(db, "enrollments", "emergency_phone", "TEXT");
  addColumnIfMissing(db, "enrollments", "waiver_accepted_at", "TEXT");
  addColumnIfMissing(db, "enrollments", "health_declared_at", "TEXT");
  addColumnIfMissing(db, "bus_types", "photo", "TEXT");
  addColumnIfMissing(db, "schedules", "plate_no", "TEXT");
  addColumnIfMissing(db, "schedules", "bus_photo", "TEXT");
  addColumnIfMissing(db, "schedules", "locked_seats", "TEXT DEFAULT '[]'");
  addColumnIfMissing(db, "schedules", "consult_group", "TEXT");
  addColumnIfMissing(db, "schedules", "offer_type", "TEXT DEFAULT 'full'");
  addColumnIfMissing(db, "schedules", "offer_price", "INTEGER");
  addColumnIfMissing(db, "schedules", "review_status", "TEXT DEFAULT 'approved'");
  addColumnIfMissing(db, "schedules", "play_tags_json", "TEXT DEFAULT '[]'");
  addColumnIfMissing(db, "schedules", "city", "TEXT");
  addColumnIfMissing(db, "schedules", "channel", "TEXT DEFAULT 'trip'");
  addColumnIfMissing(db, "schedules", "member_price_on", "INTEGER DEFAULT 1");
  addColumnIfMissing(db, "schedules", "student_price_on", "INTEGER DEFAULT 1");
  addColumnIfMissing(db, "schedules", "combo_rule_json", "TEXT DEFAULT '{}'");
  addColumnIfMissing(db, "enrollments", "combo_json", "TEXT");
  addColumnIfMissing(db, "enrollments", "supplies_json", "TEXT");
  addColumnIfMissing(db, "enrollments", "supplies_fee", "INTEGER DEFAULT 0");
  addColumnIfMissing(db, "users", "is_student", "INTEGER DEFAULT 0");
  addColumnIfMissing(db, "users", "student_status", "TEXT");
  addColumnIfMissing(db, "users", "school", "TEXT");
  addColumnIfMissing(db, "users", "group_status", "TEXT");
  addColumnIfMissing(db, "users", "group_name", "TEXT");
  addColumnIfMissing(db, "users", "group_kind", "TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      kind TEXT,
      content TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  addColumnIfMissing(db, "users", "member_gift_left", "INTEGER DEFAULT 0");
  addColumnIfMissing(db, "users", "is_virtual", "INTEGER DEFAULT 0");
  addColumnIfMissing(db, "users", "referral_code", "TEXT");
  addColumnIfMissing(db, "enrollments", "referrer_user_id", "INTEGER");
  addColumnIfMissing(db, "enrollments", "auto_alt", "INTEGER DEFAULT 0");
  addColumnIfMissing(db, "enrollments", "coupon_id", "INTEGER");
  addColumnIfMissing(db, "enrollments", "completed_at", "TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS lottery_draws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      schedule_id INTEGER DEFAULT 0,
      phase TEXT,
      prize_key TEXT,
      prize_label TEXT,
      doubled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(user_id, schedule_id, phase)
    );
    CREATE TABLE IF NOT EXISTS contest_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER,
      user_id INTEGER,
      url TEXT,
      caption TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS contest_votes (
      post_id INTEGER,
      user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (post_id, user_id)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      url TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS schedule_leaders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER,
      slot INTEGER,
      guide_id INTEGER,
      user_id INTEGER,
      status TEXT DEFAULT 'assigned',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(schedule_id, slot)
    );
    CREATE TABLE IF NOT EXISTS enrollment_fallbacks (
      enrollment_id INTEGER,
      schedule_id INTEGER,
      kind TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (enrollment_id, schedule_id)
    );
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER,
      enrollment_id INTEGER,
      amount INTEGER,
      rate REAL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS leader_referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER,
      leader_user_id INTEGER,
      schedule_id INTEGER,
      amount INTEGER DEFAULT 200,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  db.exec(`
    UPDATE users SET referral_code='BX' || id WHERE referral_code IS NULL OR referral_code='';
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS play_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      color TEXT,
      cover TEXT,
      sort_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'on'
    );
  `);
  const tagCount = db.prepare("SELECT COUNT(*) AS c FROM play_tags").get().c;
  if (!tagCount) {
    const defaults = [
      ["徒步", "#2d6a4f"],
      ["登山", "#bc4749"],
      ["玩水", "#1d6a9f"],
      ["亲子", "#c77d3a"],
      ["摄影", "#6b4c9a"],
      ["露营", "#3d6b4f"],
      ["文化", "#8b5a2b"],
      ["看星空", "#1b3a5f"],
      ["团建", "#40916c"],
    ];
    const insertTag = db.prepare("INSERT INTO play_tags (name, color, cover, sort_order, status) VALUES (?,?,?,?,?)");
    defaults.forEach((t, i) => insertTag.run(t[0], t[1], "", i + 1, "on"));
  }
  backfillBusPhotos(db);
  db.exec(`
    DELETE FROM reviews
    WHERE id NOT IN (SELECT MIN(id) FROM reviews GROUP BY user_id, schedule_id);
  `);
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_schedule ON reviews(user_id, schedule_id)");
  db.exec(`
    CREATE TABLE IF NOT EXISTS coupon_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      schedule_id INTEGER,
      name TEXT,
      kind TEXT,
      value INTEGER,
      cap_amount INTEGER DEFAULT 0,
      floor_price INTEGER DEFAULT 0,
      total INTEGER,
      claimed INTEGER DEFAULT 0,
      per_user_limit INTEGER DEFAULT 1,
      claim_start TEXT,
      claim_end TEXT,
      use_start TEXT,
      use_end TEXT,
      audience TEXT DEFAULT 'public',
      status TEXT DEFAULT 'on',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS user_coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      user_id INTEGER,
      code TEXT UNIQUE,
      status TEXT DEFAULT 'unused',
      used_enrollment_id INTEGER,
      used_at TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_campaigns_code ON coupon_campaigns(code);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_coupons_code ON user_coupons(code);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_coupons_campaign_user ON user_coupons(campaign_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_user_coupons_user ON user_coupons(user_id);
    CREATE INDEX IF NOT EXISTS idx_coupon_campaigns_schedule ON coupon_campaigns(schedule_id);
  `);
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
    packingList: String(row.equipment || "")
      .split(/[、，,;；/\n]+/)
      .map((s) => s.replace(/^(请自备|装备|含)[:：]?\s*/, "").trim())
      .filter((s) => s.length >= 2 && s.length <= 48),
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
