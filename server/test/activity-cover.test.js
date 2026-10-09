const test = require("node:test");
const assert = require("node:assert/strict");
const { activityCoverPath, activityCoverBlob } = require("../src/services/activity-cover");

test("activity covers follow the kind, and unknown kinds get the city picture", () => {
  assert.match(activityCoverPath("周末掼蛋"), /guandan\.png$/);
  assert.match(activityCoverPath("朝阳夜跑局"), /run\.png$/);
  assert.match(activityCoverPath("跑步"), /run\.png$/);
  assert.match(activityCoverPath("电影"), /movie\.png$/);
  assert.match(activityCoverPath("社团招募"), /recruit\.png$/);
  assert.match(activityCoverPath("随便聚聚"), /city\.png$/);
  assert.match(
    activityCoverPath(activityCoverBlob({ title: "棋牌", category: "掼蛋", tags_json: "[]" }, {})),
    /guandan\.png$/
  );
});
