const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const dayjs = require("dayjs");
const { getDb, ensureDirs } = require("../db");
const config = require("../config");
const { ROUTES } = require("./routes-data");
const { parseIdCard, makeIdCard } = require("../services/idcard");
const { writeCovers, downloadPhotos, coverOf, galleryOf } = require("./image-helpers");

const BUSES = [
  { id: "coaster10", name: "10 人考斯特", seats: 10, description: "豪华考斯特，适合小团和公司高管团", sort_order: 1 },
  { id: "van15", name: "15 人商务车", seats: 15, description: "丰田/金杯商务，灵活走山路", sort_order: 2 },
  { id: "bus30", name: "30 人中巴", seats: 30, description: "标准旅游中巴，团建主力", sort_order: 3 },
  { id: "bus38", name: "38 人旅游大巴", seats: 38, description: "舒适大巴，长途三日线常用", sort_order: 4 },
  { id: "bus50", name: "50 人大型大巴", seats: 50, description: "满员单价最低，适合爆款一日游", sort_order: 5 },
];

const GUIDES = [
  { name: "林晓峰", phone: "13700001101", gender: "male", years: 8, languages: "普通话,英语", specialties: "长城,登山,摄影", bio: "前户外俱乐部领队，熟稔怀柔密云长城段落与安全预案。", rating: 4.9 },
  { name: "周雨桐", phone: "13700001102", gender: "female", years: 6, languages: "普通话", specialties: "玩水,山水,亲子", bio: "十渡野三坡方向主讲，擅长亲子团节奏控制。", rating: 4.8 },
  { name: "马海亮", phone: "13700001103", gender: "male", years: 10, languages: "普通话,蒙语", specialties: "草原,文化", bio: "坝上向导，熟悉乌兰布统机位与牧区礼仪。", rating: 4.95 },
  { name: "赵文静", phone: "13700001104", gender: "female", years: 7, languages: "普通话,英语", specialties: "文化,海滨", bio: "文博背景，承德五台山讲解细腻。", rating: 4.85 },
  { name: "郭建军", phone: "13700001105", gender: "male", years: 12, languages: "普通话", specialties: "登山,长城,山水", bio: "门头沟房山老向导，气象判断稳健。", rating: 4.9 },
  { name: "苏敏", phone: "13700001106", gender: "female", years: 5, languages: "普通话", specialties: "亲子,玩水,海滨", bio: "前小学教师，带队耐心，适合家庭团。", rating: 4.8 },
];

function fakeId(region, birth, sexDigit, seq = "12") {
  return makeIdCard(region, birth, sexDigit, seq);
}

async function run() {
  ensureDirs();
  writeCovers();
  await downloadPhotos();
  const db = getDb();
  db.exec("DELETE FROM reviews; DELETE FROM payment_splits; DELETE FROM favorites; DELETE FROM points_ledger; DELETE FROM payments; DELETE FROM enrollments; DELETE FROM schedules; DELETE FROM route_buses; DELETE FROM route_price_tiers; DELETE FROM routes; DELETE FROM guides; DELETE FROM bus_types; DELETE FROM sms_codes; DELETE FROM captchas; DELETE FROM users; DELETE FROM admin_users; DELETE FROM settings;");

  const hash = bcrypt.hashSync("123456", 10);
  const adminHash = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO admin_users (username, password_hash, name, role) VALUES (?,?,?,?)").run("admin", adminHash, "平台管理员", "admin");

  const insertUser = db.prepare(`INSERT INTO users (phone, password_hash, nickname, avatar, gender, birthday, id_card, hometown, is_member, member_expire_at, points, company_name, role)
    VALUES (@phone,@password_hash,@nickname,@avatar,@gender,@birthday,@id_card,@hometown,@is_member,@member_expire_at,@points,@company_name,@role)`);

  const demoUsers = [
    { phone: "13800138000", nickname: "林北野", gender: "male", birthday: "1992-05-12", id_card: fakeId("110101", "19920512", "1"), hometown: "北京市", is_member: 1, member_expire_at: dayjs().add(300, "day").format("YYYY-MM-DD"), points: 1280, company_name: null, role: "user" },
    { phone: "13800138001", nickname: "陈小川", gender: "female", birthday: "1996-08-20", id_card: fakeId("130102", "19960820", "2"), hometown: "河北省石家庄市", is_member: 0, member_expire_at: null, points: 80, company_name: null, role: "user" },
    { phone: "13900139000", nickname: "华创团建", gender: "male", birthday: "1988-01-08", id_card: fakeId("110105", "19880108", "1"), hometown: "北京市", is_member: 1, member_expire_at: dayjs().add(200, "day").format("YYYY-MM-DD"), points: 520, company_name: "北京华创科技有限公司", role: "company" },
    { phone: "13700137000", nickname: "领队老周", gender: "male", birthday: "1985-11-03", id_card: fakeId("140107", "19851103", "1"), hometown: "山西省太原市", is_member: 1, member_expire_at: dayjs().add(100, "day").format("YYYY-MM-DD"), points: 860, company_name: null, role: "organizer" },
  ];
  const userIds = {};
  for (const u of demoUsers) {
    const info = insertUser.run({ ...u, password_hash: hash, avatar: "" });
    userIds[u.phone] = Number(info.lastInsertRowid);
  }

  const extraPeople = [
    ["110101", "19900101", "1", "王磊", "male"],
    ["110108", "19930518", "2", "李娜", "female"],
    ["120101", "19880606", "1", "张强", "male"],
    ["130203", "19991212", "2", "刘芳", "female"],
    ["130628", "20010808", "1", "赵鹏", "male"],
    ["140202", "19751201", "1", "孙建国", "male"],
    ["150404", "19941111", "2", "其其格", "female"],
    ["210102", "19830303", "1", "周洋", "male"],
    ["310101", "19970707", "2", "吴倩", "female"],
    ["320106", "20000101", "1", "徐晨", "male"],
    ["330106", "19920828", "2", "沈佳", "female"],
    ["370202", "19890909", "1", "郑浩", "male"],
    ["410102", "19960606", "2", "何敏", "female"],
    ["420106", "19780818", "1", "胡波", "male"],
    ["440304", "19911111", "2", "蔡雨", "female"],
    ["510104", "20020505", "1", "唐飞", "male"],
    ["610102", "19840202", "2", "白露", "female"],
    ["130802", "19950315", "1", "承德小刘", "male"],
    ["110106", "20120101", "2", "童童", "female"],
    ["110107", "20150808", "1", "浩浩", "male"],
  ];
  extraPeople.forEach((p, i) => {
    const idCard = fakeId(p[0], p[1], p[2].slice(-1) === "1" || p[4] === "male" ? "1" : "2");
    const parsed = parseIdCard(idCard);
    insertUser.run({
      phone: `1360000${String(1000 + i)}`,
      password_hash: hash,
      nickname: p[3],
      avatar: "",
      gender: p[4],
      birthday: `${p[1].slice(0, 4)}-${p[1].slice(4, 6)}-${p[1].slice(6, 8)}`,
      id_card: idCard,
      hometown: parsed.hometown || p[3],
      is_member: i % 3 === 0 ? 1 : 0,
      member_expire_at: i % 3 === 0 ? dayjs().add(100, "day").format("YYYY-MM-DD") : null,
      points: 50 + i * 10,
      company_name: i < 6 ? "北京华创科技有限公司" : null,
      role: "user",
    });
  });

  const insertBus = db.prepare("INSERT INTO bus_types (id,name,seats,description,sort_order) VALUES (@id,@name,@seats,@description,@sort_order)");
  BUSES.forEach((b) => insertBus.run(b));

  const insertGuide = db.prepare("INSERT INTO guides (name,phone,gender,years,languages,specialties,rating,bio,status) VALUES (?,?,?,?,?,?,?,?,?)");
  GUIDES.forEach((g) => insertGuide.run(g.name, g.phone, g.gender, g.years, g.languages, g.specialties, g.rating, g.bio, "idle"));

  const insertRoute = db.prepare(`INSERT INTO routes (code,title,subtitle,days,distance_km,difficulty,category,region,season,tags_json,cover,gallery_json,min_group_size,description,highlights_json,itinerary_json,fee_include,fee_exclude,equipment,notices,meetup_json,status)
    VALUES (@code,@title,@subtitle,@days,@distance_km,@difficulty,@category,@region,@season,@tags_json,@cover,@gallery_json,@min_group_size,@description,@highlights_json,@itinerary_json,@fee_include,@fee_exclude,@equipment,@notices,@meetup_json,'on')`);
  const insertTier = db.prepare("INSERT INTO route_price_tiers (route_id,min_people,max_people,price,member_price) VALUES (?,?,?,?,?)");
  const insertRb = db.prepare("INSERT INTO route_buses (route_id, bus_type_id) VALUES (?,?)");

  const routeIds = {};
  for (const r of ROUTES) {
    const info = insertRoute.run({
      code: r.code,
      title: r.title,
      subtitle: r.subtitle,
      days: r.days,
      distance_km: r.distanceKm,
      difficulty: r.difficulty,
      category: r.category,
      region: r.region,
      season: r.season,
      tags_json: JSON.stringify(r.tags),
      cover: coverOf(r),
      gallery_json: JSON.stringify(galleryOf(r)),
      min_group_size: r.minGroupSize,
      description: r.description,
      highlights_json: JSON.stringify(r.highlights),
      itinerary_json: JSON.stringify(r.itinerary),
      fee_include: r.feeInclude,
      fee_exclude: r.feeExclude,
      equipment: r.equipment,
      notices: r.notices,
      meetup_json: JSON.stringify(r.meetupPoints),
    });
    const rid = Number(info.lastInsertRowid);
    routeIds[r.code] = rid;
    r.priceTiers.forEach((t) => insertTier.run(rid, t.minPeople, t.maxPeople || null, t.price, t.memberPrice));
    r.buses.forEach((b) => insertRb.run(rid, b));
  }

  const insertSch = db.prepare(`INSERT INTO schedules (route_id,start_date,end_date,organizer_type,organizer_id,organizer_name,company_name,bus_type_id,min_group_size,max_seats,meetup_point,meetup_time,status,share_token,notes,cost_transport,cost_ticket,cost_hotel,cost_meal,cost_guide,cost_other,guide_id)
    VALUES (@route_id,@start_date,@end_date,@organizer_type,@organizer_id,@organizer_name,@company_name,@bus_type_id,@min_group_size,@max_seats,@meetup_point,@meetup_time,@status,@share_token,@notes,@cost_transport,@cost_ticket,@cost_hotel,@cost_meal,@cost_guide,@cost_other,@guide_id)`);

  const upcoming = (daysFromNow, length) => {
    const start = dayjs().add(daysFromNow, "day").format("YYYY-MM-DD");
    const end = dayjs().add(daysFromNow + length - 1, "day").format("YYYY-MM-DD");
    return { start, end };
  };

  const schedulesSeed = [
    { code: "R01", ...upcoming(7, 1), organizer_type: "individual", organizer_id: userIds["13700137000"], organizer_name: "领队老周", company_name: null, bus_type_id: "bus30", meetup_point: "东直门东方银座C口", meetup_time: "07:30", notes: "周末人气场，可积分抵现", cost_transport: 1800, cost_ticket: 1200, cost_hotel: 0, cost_meal: 0, cost_guide: 400, cost_other: 120 },
    { code: "R01", ...upcoming(14, 1), organizer_type: "company", organizer_id: userIds["13900139000"], organizer_name: "华创团建", company_name: "北京华创科技有限公司", bus_type_id: "bus50", meetup_point: "国贸桥下大巴停靠点", meetup_time: "07:10", notes: "公司团建，统一挂账，活动后结算", cost_transport: 2200, cost_ticket: 2000, cost_hotel: 0, cost_meal: 800, cost_guide: 500, cost_other: 200 },
    { code: "R05", ...upcoming(10, 1), organizer_type: "individual", organizer_id: userIds["13800138000"], organizer_name: "林北野", company_name: null, bus_type_id: "bus30", meetup_point: "丽泽桥西南角", meetup_time: "07:00", notes: "夏季漂流专场", cost_transport: 1600, cost_ticket: 1500, cost_hotel: 0, cost_meal: 0, cost_guide: 400, cost_other: 80 },
    { code: "R16", ...upcoming(21, 2), organizer_type: "individual", organizer_id: userIds["13700137000"], organizer_name: "领队老周", company_name: null, bus_type_id: "coaster10", meetup_point: "东直门东方银座C口", meetup_time: "07:30", notes: "精品小团，考斯特", cost_transport: 2800, cost_ticket: 3600, cost_hotel: 2400, cost_meal: 600, cost_guide: 800, cost_other: 200 },
    { code: "R24", ...upcoming(30, 3), organizer_type: "company", organizer_id: userIds["13900139000"], organizer_name: "华创团建", company_name: "北京华创科技有限公司", bus_type_id: "bus38", meetup_point: "东直门东方银座C口", meetup_time: "06:30", notes: "公司三日坝上", cost_transport: 6800, cost_ticket: 4200, cost_hotel: 9600, cost_meal: 3600, cost_guide: 1500, cost_other: 800 },
    { code: "R04", ...upcoming(5, 1), organizer_type: "individual", organizer_id: userIds["13800138000"], organizer_name: "林北野", company_name: null, bus_type_id: "bus30", meetup_point: "国贸桥下大巴停靠点", meetup_time: "07:00", notes: "即将成团", cost_transport: 1900, cost_ticket: 2200, cost_hotel: 0, cost_meal: 0, cost_guide: 450, cost_other: 100 },
  ];

  const schIds = [];
  for (const s of schedulesSeed) {
    const seats = BUSES.find((b) => b.id === s.bus_type_id).seats;
    const minG = ROUTES.find((r) => r.code === s.code).minGroupSize;
    const info = insertSch.run({
      route_id: routeIds[s.code],
      start_date: s.start,
      end_date: s.end,
      organizer_type: s.organizer_type,
      organizer_id: s.organizer_id,
      organizer_name: s.organizer_name,
      company_name: s.company_name,
      bus_type_id: s.bus_type_id,
      min_group_size: minG,
      max_seats: seats,
      meetup_point: s.meetup_point,
      meetup_time: s.meetup_time,
      status: "recruiting",
      share_token: nanoid(10),
      notes: s.notes,
      cost_transport: s.cost_transport,
      cost_ticket: s.cost_ticket,
      cost_hotel: s.cost_hotel,
      cost_meal: s.cost_meal,
      cost_guide: s.cost_guide,
      cost_other: s.cost_other,
      guide_id: null,
    });
    schIds.push(Number(info.lastInsertRowid));
  }

  const users = db.prepare("SELECT * FROM users").all();
  const insertEn = db.prepare(`INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,gender,birthday,hometown,traveler_type,pay_status,pay_amount,points_used,pay_channel,join_mode,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertPay = db.prepare(`INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark) VALUES (?,?,?,?,?,?,?,?)`);
  const insertPt = db.prepare("INSERT INTO points_ledger (user_id,delta,balance,reason,ref_type,ref_id) VALUES (?,?,?,?,?,?)");

  function enrollSome(scheduleId, count, companyPending) {
    const slice = users.slice(0, count);
    slice.forEach((u, idx) => {
      const parsed = parseIdCard(u.id_card);
      const payStatus = companyPending ? "company_pending" : "paid";
      const amount = companyPending ? 0 : 179 - (idx > 15 ? 20 : 0);
      const info = insertEn.run(
        scheduleId,
        u.id,
        u.nickname,
        u.phone,
        u.id_card,
        u.gender,
        u.birthday,
        parsed.hometown || u.hometown,
        Number(u.birthday?.slice(0, 4) || 1990) >= 2010 ? "child" : "adult",
        payStatus,
        amount,
        0,
        companyPending ? "" : "wechat",
        "chain",
        "joined"
      );
      if (!companyPending) {
        insertPay.run(Number(info.lastInsertRowid), u.id, scheduleId, amount, "wechat", "success", `MOCK${Date.now()}${idx}`, "演示支付");
        insertPt.run(u.id, amount, (u.points || 0) + amount, "活动积分", "enrollment", Number(info.lastInsertRowid));
      }
    });
  }

  enrollSome(schIds[0], 18, false);
  enrollSome(schIds[1], 22, true);
  enrollSome(schIds[2], 8, false);
  enrollSome(schIds[3], 6, false);
  enrollSome(schIds[4], 12, true);
  enrollSome(schIds[5], 16, false);

  db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run("site_name", "北野行");
  db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run("member_annual_fee", String(config.member.annualFee));
  db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run("wx_pay_mock", "1");

  const { maybeMatchGuide } = require("../services/helpers");
  schIds.forEach((id) => maybeMatchGuide(id));

  console.log("seed ok, routes=", ROUTES.length, "db=", config.dbFile);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
