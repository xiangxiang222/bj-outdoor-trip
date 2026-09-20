const config = require("./config");
const { createApp } = require("./app");

try {
  const app = createApp();
  app.listen(config.port, "0.0.0.0", () => {
    console.log(`同行者众 API 已启动 http://localhost:${config.port}`);
    const { runOfficialJobs } = require("./services/official-trip");
    const { runHeatJobs } = require("./services/virtual-heat");
    const tick = () => {
      try {
        runOfficialJobs();
      } catch (err) {
        console.error("官方团任务失败", err);
      }
      try {
        runHeatJobs();
      } catch (err) {
        console.error("热度任务失败", err);
      }
    };
    tick();
    setInterval(() => {
      try {
        runOfficialJobs();
      } catch (err) {
        console.error("官方团任务失败", err);
      }
    }, 60 * 60 * 1000);
    setInterval(() => {
      try {
        runHeatJobs();
      } catch (err) {
        console.error("热度任务失败", err);
      }
    }, 5 * 60 * 1000);
  });
} catch (err) {
  console.error("同行者众启动失败", err);
  process.exit(1);
}
