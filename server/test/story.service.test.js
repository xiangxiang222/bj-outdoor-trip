const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeStory, composeStory, storyOf, normalizeItinerary } = require("../src/services/story");

describe("route story blocks", () => {
  it("drops empty blocks and keeps text then image", () => {
    assert.deepEqual(
      normalizeStory([
        { type: "text", body: "  " },
        { type: "text", body: "慕田峪更疏朗" },
        { type: "image", url: "/static/photos/wall1.jpg", caption: "城墙" },
        { type: "image" },
      ]),
      [
        { type: "text", body: "慕田峪更疏朗" },
        { type: "image", url: "/static/photos/wall1.jpg", caption: "城墙" },
      ]
    );
  });

  it("weaves description paragraphs with the first gallery photos", () => {
    const blocks = composeStory("上段。\n\n下段。", ["/a.jpg", "/b.jpg", "/c.jpg", "/d.jpg"]);
    assert.deepEqual(blocks, [
      { type: "text", body: "上段。" },
      { type: "image", url: "/a.jpg", caption: "" },
      { type: "text", body: "下段。" },
      { type: "image", url: "/b.jpg", caption: "" },
    ]);
  });

  it("prefers a saved story over the auto weave", () => {
    const route = {
      description: "旧介绍",
      gallery: ["/a.jpg"],
      story: [{ type: "text", body: "手写的一段" }],
    };
    assert.deepEqual(storyOf(route), [{ type: "text", body: "手写的一段" }]);
    assert.equal(storyOf({ description: "只有字" })[0].body, "只有字");
  });

  it("keeps an optional photo on each itinerary stop", () => {
    assert.deepEqual(normalizeItinerary([{ time: "07:30", title: "出发", detail: "集合", photo: "/a.jpg" }, {}]), [
      { time: "07:30", title: "出发", detail: "集合", photo: "/a.jpg" },
    ]);
  });
});
