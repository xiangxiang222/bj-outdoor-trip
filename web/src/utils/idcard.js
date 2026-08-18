const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CODES = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];

export function normalizeIdCard(idCard) {
  return String(idCard || "").trim().toUpperCase().replace(/\s+/g, "");
}

function checkDigit(body17) {
  const sum = String(body17)
    .split("")
    .reduce((acc, ch, i) => acc + Number(ch) * WEIGHTS[i], 0);
  return CODES[sum % 11];
}

function isRealDate(year, month, day) {
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return dt <= today;
}

export function parseIdCard(idCard) {
  const raw = normalizeIdCard(idCard);
  if (!raw) return { valid: false, error: "请填写身份证号" };
  if (/^\d{15}$/.test(raw)) return { valid: false, error: "请填写18位身份证号，暂不支持15位旧证" };
  if (!/^\d{17}[\dX]$/.test(raw)) return { valid: false, error: "请填写18位身份证号" };
  const year = Number(raw.slice(6, 10));
  const month = Number(raw.slice(10, 12));
  const day = Number(raw.slice(12, 14));
  if (!isRealDate(year, month, day)) return { valid: false, error: "身份证出生日期无效" };
  if (checkDigit(raw.slice(0, 17)) !== raw.slice(17)) {
    return { valid: false, error: "身份证校验码不正确" };
  }
  const seq = Number(raw.slice(16, 17));
  return {
    valid: true,
    idCard: raw,
    gender: seq % 2 === 1 ? "male" : "female",
    birthday: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}
