const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const config = require("./config");
const { getDb, ensureDirs } = require("./db");
const api = require("./api");

function createApp() {
  ensureDirs();
  getDb();
  const app = express();
  app.set("trust proxy", true);
  app.use(cors());
  app.use(express.json({ limit: "4mb" }));
  app.use("/static", express.static(path.join(config.publicDir, "static")));
  app.get("/c/:code", (req, res) => {
    const code = String(req.params.code || "").replace(/[^A-Za-z0-9_-]/g, "");
    if (!code) return res.status(404).end();
    res.redirect(302, `/m/coupon/${encodeURIComponent(code)}`);
  });
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
