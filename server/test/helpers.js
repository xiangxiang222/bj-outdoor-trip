const bcrypt = require("bcryptjs");
const dayjs = require("dayjs");
const { getDb } = require("../src/db");

const PASSWORD = "123456";

function wipe(db) {
  db.exec(`
    DELETE FROM contest_votes;
    DELETE FROM contest_posts;
    DELETE FROM lottery_draws;
    DELETE FROM feedbacks;
    DELETE FROM leader_referrals;
    DELETE FROM referrals;
    DELETE FROM enrollment_fallbacks;
    DELETE FROM schedule_leaders;
    DELETE FROM user_photos;
    DELETE FROM play_tags;
    DELETE FROM reviews;
    DELETE FROM payment_splits;
    DELETE FROM favorites;
    DELETE FROM points_ledger;
    DELETE FROM payments;
    DELETE FROM user_coupons;
    DELETE FROM coupon_campaigns;
    DELETE FROM enrollments;
    DELETE FROM schedules;
    DELETE FROM route_buses;
    DELETE FROM route_price_tiers;
    DELETE FROM routes;
    DELETE FROM guides;
    DELETE FROM bus_types;
    DELETE FROM sms_logs;
    DELETE FROM sms_codes;
    DELETE FROM captchas;
    DELETE FROM users;
    DELETE FROM admin_users;
    DELETE FROM settings;
  `);
}

function seedMinimal() {
  const db = getDb();
  wipe(db);
  const userHash = bcrypt.hashSync(PASSWORD, 8);
  const adminHash = bcrypt.hashSync("admin123", 8);
  const adminId = Number(
    db.prepare("INSERT INTO admin_users (username, password_hash, name, role, status) VALUES (?,?,?,?,?)").run(
      "admin",
      adminHash,
      "平台管理员",
      "admin",
      "on"
    ).lastInsertRowid
  );

  const insertUser = db.prepare(
    `INSERT INTO users (phone,password_hash,nickname,gender,birthday,id_card,hometown,is_member,member_expire_at,points,company_name,role)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const userId = Number(
    insertUser.run(
      "13800138000",
      userHash,
      "林北野",
      "male",
      "1992-05-12",
      "110101199205121219",
      "北京市",
      1,
      dayjs().add(200, "day").format("YYYY-MM-DD"),
      500,
      null,
      "user"
    ).lastInsertRowid
  );
  const companyUserId = Number(
    insertUser.run(
      "13900139000",
      userHash,
      "华创团建",
      "male",
      "1988-01-08",
      "11010519880108121X",
      "北京市",
      1,
      dayjs().add(200, "day").format("YYYY-MM-DD"),
      100,
      "北京华创科技有限公司",
      "company"
    ).lastInsertRowid
  );

  db.prepare("INSERT INTO bus_types (id,name,seats,description,sort_order) VALUES (?,?,?,?,?)").run(
    "coaster10",
    "10 人考斯特",
    10,
    "小团",
    1
  );
  db.prepare("INSERT INTO bus_types (id,name,seats,description,sort_order) VALUES (?,?,?,?,?)").run(
    "bus30",
    "30 人中巴",
    30,
    "中巴",
    2
  );

  db.prepare(
    "INSERT INTO guides (name,phone,gender,years,languages,specialties,rating,bio,status) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run("林晓峰", "13700001101", "male", 8, "普通话", "长城,登山", 4.9, "长城向导", "idle");
  const guideId = Number(db.prepare("SELECT id FROM guides WHERE phone=?").get("13700001101").id);

  const routeId = Number(
    db.prepare(
      `INSERT INTO routes (code,title,subtitle,days,distance_km,difficulty,category,region,season,tags_json,cover,gallery_json,min_group_size,description,highlights_json,itinerary_json,fee_include,fee_exclude,equipment,notices,meetup_json,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      "R01",
      "慕田峪长城缆车一日游",
      "测试线路",
      1,
      78,
      "休闲",
      "长城",
      "北京怀柔",
      "3-11月",
      JSON.stringify(["长城"]),
      "/static/photos/wall1.jpg",
      JSON.stringify(["/static/photos/wall1.jpg"]),
      2,
      "介绍",
      JSON.stringify(["亮点"]),
      JSON.stringify([{ time: "07:30", title: "出发", detail: "集合" }]),
      "车费",
      "餐食",
      "运动鞋",
      "注意安全",
      JSON.stringify([{ id: "dzm", name: "东直门东方银座C口" }]),
      "on"
    ).lastInsertRowid
  );
  db.prepare("INSERT INTO route_price_tiers (route_id,min_people,max_people,price,member_price) VALUES (?,?,?,?,?)").run(
    routeId,
    10,
    null,
    199,
    183
  );
  db.prepare("INSERT INTO route_price_tiers (route_id,min_people,max_people,price,member_price) VALUES (?,?,?,?,?)").run(
    routeId,
    20,
    null,
    179,
    165
  );
  db.prepare("INSERT INTO route_buses (route_id, bus_type_id) VALUES (?,?)").run(routeId, "bus30");
  db.prepare("INSERT INTO route_buses (route_id, bus_type_id) VALUES (?,?)").run(routeId, "coaster10");

  const start = dayjs().add(7, "day").format("YYYY-MM-DD");
  const insertSch = db.prepare(
    `INSERT INTO schedules (route_id,start_date,end_date,organizer_type,organizer_id,organizer_name,company_name,bus_type_id,min_group_size,max_seats,meetup_point,meetup_time,status,share_token,notes,cost_transport,cost_ticket,cost_hotel,cost_meal,cost_guide,cost_other)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const individualScheduleId = Number(
    insertSch.run(
      routeId,
      start,
      start,
      "individual",
      userId,
      "林北野",
      null,
      "coaster10",
      2,
      10,
      "东直门东方银座C口",
      "07:30",
      "recruiting",
      "shareind01",
      "个人团",
      800,
      400,
      0,
      0,
      200,
      50
    ).lastInsertRowid
  );
  const companyScheduleId = Number(
    insertSch.run(
      routeId,
      dayjs().add(14, "day").format("YYYY-MM-DD"),
      dayjs().add(14, "day").format("YYYY-MM-DD"),
      "company",
      companyUserId,
      "华创团建",
      "北京华创科技有限公司",
      "bus30",
      2,
      30,
      "国贸桥下大巴停靠点",
      "07:10",
      "recruiting",
      "shareco01",
      "公司团",
      1800,
      1200,
      0,
      800,
      400,
      100
    ).lastInsertRowid
  );

  const { backfillBusPhotos } = require("../src/seed/bus-art");
  backfillBusPhotos(db);

  return {
    db,
    adminId,
    userId,
    companyUserId,
    routeId,
    individualScheduleId,
    companyScheduleId,
    guideId,
    password: PASSWORD,
  };
}

module.exports = { seedMinimal, wipe, PASSWORD };
