import { describe, it, expect } from "vitest";
import { mediaSrc, slideBg, slideFallback } from "./media";

describe("mediaSrc", () => {
  it("keeps site-relative static paths", () => {
    expect(mediaSrc("http://192.144.167.212/static/photos/juyong.jpg")).toBe("/static/photos/juyong.jpg");
    expect(mediaSrc("/static/photos/juyong.jpg")).toBe("/static/photos/juyong.jpg");
  });

  it("builds css background and svg fallback", () => {
    expect(slideFallback({ code: "R02" })).toBe("/static/routes/R02.svg");
    expect(slideBg({ url: "http://example/static/photos/a.jpg" }).backgroundImage).toBe('url("/static/photos/a.jpg")');
  });
});
