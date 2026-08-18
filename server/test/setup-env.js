const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bj-ut-${process.pid}-`));
const webDist = path.join(dir, "webdist");
fs.mkdirSync(webDist, { recursive: true });
fs.writeFileSync(path.join(webDist, "index.html"), "<!doctype html><html><body>spa</body></html>");
process.env.MMC_DATA_DIR = dir;
process.env.MMC_DB_FILE = path.join(dir, "app.sqlite");
process.env.MMC_PUBLIC_DIR = path.join(dir, "public");
process.env.MMC_WEB_DIST_DIR = webDist;
process.env.MMC_SKIP_WEB = "0";
process.env.PORT = "0";
