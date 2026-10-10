import { describe, it, expect } from "vitest";
import { composeStory, groupStoryBlocks, storyAlbum } from "./story";

describe("composeStory", () => {
  it("interleaves paragraphs and photos", () => {
    expect(composeStory("上段。\n\n下段。", ["/a.jpg", "/b.jpg"])).toEqual([
      { type: "text", body: "上段。" },
      { type: "image", url: "/a.jpg", caption: "" },
      { type: "text", body: "下段。" },
      { type: "image", url: "/b.jpg", caption: "" },
    ]);
  });
});

describe("groupStoryBlocks", () => {
  it("keeps a single photo under its paragraph and slides consecutive photos together", () => {
    expect(groupStoryBlocks([
      { type: "text", body: "进山" },
      { type: "image", url: "/a.jpg", caption: "瀑" },
      { type: "image", url: "/b.jpg", caption: "" },
      { type: "text", body: "上梁" },
    ])).toEqual([
      { type: "text", body: "进山" },
      { type: "images", items: [{ type: "image", url: "/a.jpg", caption: "瀑" }, { type: "image", url: "/b.jpg", caption: "" }] },
      { type: "text", body: "上梁" },
    ]);
  });
});

describe("storyAlbum", () => {
  it("hides photos already used in the story", () => {
    expect(storyAlbum(["/a.jpg", "/b.jpg"], [{ type: "image", url: "/a.jpg" }])).toEqual(["/b.jpg"]);
  });
});
