const config = require("./config");
const { createApp } = require("./app");

const app = createApp();
app.listen(config.port, "0.0.0.0", () => {
  console.log(`同行者众 API 已启动 http://localhost:${config.port}`);
});
