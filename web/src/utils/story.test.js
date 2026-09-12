import { describe, it, expect } from "vitest";
import { composeStory, storyAlbum } from "./story";

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

describe("storyAlbum", () => {
  it("hides photos already used in the story", () => {
    expect(storyAlbum(["/a.jpg", "/b.jpg"], [{ type: "image", url: "/a.jpg" }])).toEqual(["/b.jpg"]);
  });
});
