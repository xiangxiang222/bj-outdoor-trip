const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const config = require("./config");
const { getDb, ensureDirs } = require("./db");
const api = require("./api");
const { localizeEnglishResponse } = require("./services/route-i18n");

function createApp() {
  ensureDirs();
  getDb();
  const app = express();
  app.set("trust proxy", true);
  app.use(cors());
  app.post("/api/pay/wechat/notify", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
    const xml = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
    const { handleWechatNotify } = require("./services/payment");
    res.type("text/xml").send(await handleWechatNotify(xml));
  });
  app.use(express.json({ limit: "4mb" }));
  const { sendThumb } = require("./services/thumbs");
  app.get(/^\/static\/thumbs\/(360|960)\/(.+)$/, (req, res) => {
    sendThumb(req, res).catch(() => {
      if (!res.headersSent) res.status(404).end();
    });
  });
  app.use("/static", express.static(path.join(config.publicDir, "static"), { maxAge: "7d" }));
  app.get("/c/:code", (req, res) => {
    const code = String(req.params.code || "").replace(/[^A-Za-z0-9_-]/g, "");
    if (!code) return res.status(404).end();
    res.redirect(302, `/m/coupon/${encodeURIComponent(code)}`);
  });
  app.use(localizeEnglishResponse);
  app.use("/api", api);

  const webDist = config.webDistDir;
  if (process.env.MMC_SKIP_WEB !== "1" && fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      if (req.path.startsWith("/api") || req.path.startsWith("/static") || req.path.startsWith("/c/")) return next();
      res.sendFile(path.join(webDist, "index.html"));
    });
  }
  return app;
}

module.exports = { createApp };
