/** 身份证前 2/4 位行政区划，用于籍贯统计 */
const PROVINCES = {
  11: "北京市",
  12: "天津市",
  13: "河北省",
  14: "山西省",
  15: "内蒙古自治区",
  21: "辽宁省",
  22: "吉林省",
  23: "黑龙江省",
  31: "上海市",
  32: "江苏省",
  33: "浙江省",
  34: "安徽省",
  35: "福建省",
  36: "江西省",
  37: "山东省",
  41: "河南省",
  42: "湖北省",
  43: "湖南省",
  44: "广东省",
  45: "广西壮族自治区",
  46: "海南省",
  50: "重庆市",
  51: "四川省",
  52: "贵州省",
  53: "云南省",
  54: "西藏自治区",
  61: "陕西省",
  62: "甘肃省",
  63: "青海省",
  64: "宁夏回族自治区",
  65: "新疆维吾尔自治区",
  71: "台湾省",
  81: "香港特别行政区",
  82: "澳门特别行政区",
};

const CITIES = {
  1101: "北京市",
  1201: "天津市",
  1301: "石家庄市",
  1302: "唐山市",
  1303: "秦皇岛市",
  1304: "邯郸市",
  1305: "邢台市",
  1306: "保定市",
  1307: "张家口市",
  1308: "承德市",
  1309: "沧州市",
  1310: "廊坊市",
  1311: "衡水市",
  1401: "太原市",
  1402: "大同市",
  1407: "晋中市",
  1410: "临汾市",
  1501: "呼和浩特市",
  1504: "赤峰市",
  1525: "锡林郭勒盟",
  2101: "沈阳市",
  2102: "大连市",
  2201: "长春市",
  2301: "哈尔滨市",
  3101: "上海市",
  3201: "南京市",
  3205: "苏州市",
  3301: "杭州市",
  3701: "济南市",
  3702: "青岛市",
  4101: "郑州市",
  4201: "武汉市",
  4301: "长沙市",
  4401: "广州市",
  4403: "深圳市",
  5001: "重庆市",
  5101: "成都市",
  6101: "西安市",
};

const AGE_BUCKETS = [
  { key: "0-12", label: "儿童 0-12", min: 0, max: 12 },
  { key: "13-17", label: "青少年 13-17", min: 13, max: 17 },
  { key: "18-25", label: "18-25 岁", min: 18, max: 25 },
  { key: "26-35", label: "26-35 岁", min: 26, max: 35 },
  { key: "36-45", label: "36-45 岁", min: 36, max: 45 },
  { key: "46-55", label: "46-55 岁", min: 46, max: 55 },
  { key: "56-65", label: "56-65 岁", min: 56, max: 65 },
  { key: "66+", label: "66 岁以上", min: 66, max: 200 },
];

const CHECK_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECK_CODES = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];

function normalizeIdCard(idCard) {
  return String(idCard || "").trim().toUpperCase().replace(/\s+/g, "");
}

function checkDigit(body17) {
  const sum = String(body17)
    .split("")
    .reduce((acc, ch, i) => acc + Number(ch) * CHECK_WEIGHTS[i], 0);
  return CHECK_CODES[sum % 11];
}

function makeIdCard(region, birth, sexDigit, seq = "12") {
  const body = `${region}${birth}${seq}${sexDigit}`;
  return body + checkDigit(body);
}

function isRealDate(year, month, day) {
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return dt <= today;
}

function maskIdCard(idCard) {
  if (!idCard || idCard.length < 10) return idCard || "";
  return `${idCard.slice(0, 6)}********${idCard.slice(-4)}`;
}

function parseIdCard(idCard) {
  const raw = normalizeIdCard(idCard);
  if (!raw) return { valid: false, error: "请填写身份证号" };
  if (/^\d{15}$/.test(raw)) return { valid: false, error: "请填写18位身份证号，暂不支持15位旧证" };
  if (!/^\d{17}[\dX]$/.test(raw)) return { valid: false, error: "请填写18位身份证号" };
  const birth = raw.slice(6, 14);
  const year = Number(birth.slice(0, 4));
  const month = Number(birth.slice(4, 6));
  const day = Number(birth.slice(6, 8));
  if (!isRealDate(year, month, day)) return { valid: false, error: "身份证出生日期无效" };
  if (checkDigit(raw.slice(0, 17)) !== raw.slice(17)) {
    return { valid: false, error: "身份证校验码不正确" };
  }
  const regionCode = raw.slice(0, 6);
  const cityCode = raw.slice(0, 4);
  const provinceCode = raw.slice(0, 2);
  const seq = Number(raw.slice(16, 17));
  const gender = seq % 2 === 1 ? "male" : "female";
  const today = new Date();
  let age = today.getFullYear() - year;
  const md = (today.getMonth() + 1) * 100 + today.getDate();
  if (md < month * 100 + day) age -= 1;
  const province = PROVINCES[provinceCode] || "未知";
  const city = CITIES[cityCode] || province;
  const bucket = AGE_BUCKETS.find((b) => age >= b.min && age <= b.max) || AGE_BUCKETS[AGE_BUCKETS.length - 1];
  return {
    valid: true,
    idCard: raw,
    regionCode,
    cityCode,
    provinceCode,
    province,
    city,
    hometown: city === province ? province : `${province}${city}`,
    birthday: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    gender,
    age,
    ageBucket: bucket.key,
    ageLabel: bucket.label,
  };
}

function ageBucketOf(age) {
  const bucket = AGE_BUCKETS.find((b) => age >= b.min && age <= b.max);
  return bucket || AGE_BUCKETS[AGE_BUCKETS.length - 1];
}

module.exports = {
  PROVINCES,
  CITIES,
  AGE_BUCKETS,
  maskIdCard,
  parseIdCard,
  ageBucketOf,
  checkDigit,
  makeIdCard,
  normalizeIdCard,
};
