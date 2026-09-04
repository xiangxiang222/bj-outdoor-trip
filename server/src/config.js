const path = require("path");

const rootDir = path.join(__dirname, "..");

module.exports = {
  port: Number(process.env.PORT || 3780),
  jwtSecret: process.env.JWT_SECRET || "bj-outdoor-trip-dev-secret-change-me",
  jwtExpire: "30d",
  adminJwtExpire: "7d",
  dataDir: process.env.MMC_DATA_DIR || path.join(rootDir, "data"),
  dbFile: process.env.MMC_DB_FILE || path.join(rootDir, "data", "app.sqlite"),
  publicDir: process.env.MMC_PUBLIC_DIR || path.join(rootDir, "public"),
  webDistDir: process.env.MMC_WEB_DIST_DIR || path.join(rootDir, "..", "web", "dist"),
  demoSmsCode: "888888",
  wechat: {
    appId: process.env.WX_APPID || "wx_demo_appid",
    appSecret: process.env.WX_APPSECRET || "wx_demo_secret",
    mchId: process.env.WX_MCH_ID || "",
    mchKey: process.env.WX_MCH_KEY || "",
    notifyUrl: process.env.WX_PAY_NOTIFY || "http://localhost:3780/api/pay/wechat/notify",
    mock: process.env.WX_PAY_MOCK !== "0",
  },
  points: {
    earnRate: 1,
    redeemRate: 100,
    maxOffsetRatio: 0.2,
  },
  member: {
    annualFee: 99,
    discountRate: 0.95,
    pointsBonus: 1.2,
    durationDays: 365,
    giftMaxPrice: 100,
    giftTrips: 1,
  },
  student: {
    discountRate: 0.9,
  },
  insurance: {
    plans: [
      { code: "none", name: "暂不购买", fee: 0, cover: "出行风险自担" },
      { code: "outdoor", name: "户外意外险", fee: 20, cover: "意外身故/伤残 10 万，医疗 2 万" },
      { code: "plus", name: "升级高额险", fee: 48, cover: "意外身故/伤残 50 万，医疗 5 万" },
    ],
  },
  split: {
    platformRate: 0.08,
  },
  referral: {
    enrollRate: 0.05,
    leaderReward: 200,
  },
};
