const config = require("./config");
const { createApp } = require("./app");

try {
  const app = createApp();
  app.listen(config.port, "0.0.0.0", () => {
    console.log(`同行者众 API 已启动 http://localhost:${config.port}`);
  });
} catch (err) {
  console.error("同行者众启动失败", err);
  process.exit(1);
}
