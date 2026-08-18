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
    annualFee: 199,
    discountRate: 0.92,
    pointsBonus: 1.2,
    durationDays: 365,
  },
};
