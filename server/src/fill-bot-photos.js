const { fillMissingBotPhotos } = require("./services/route-bot");

fillMissingBotPhotos()
  .then((filled) => {
    console.log(`已为 ${filled} 条待审采集稿补上封面`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
