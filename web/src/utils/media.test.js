import { describe, it, expect } from "vitest";
import { mediaSrc, slideBg, slideFallback, slideRouteTarget } from "./media";

describe("mediaSrc", () => {
  it("keeps site-relative static paths", () => {
    expect(mediaSrc("http://192.144.167.212/static/photos/juyong.jpg")).toBe("/static/photos/juyong.jpg");
    expect(mediaSrc("/static/photos/juyong.jpg")).toBe("/static/photos/juyong.jpg");
  });

  it("builds css background and svg fallback", () => {
    expect(slideFallback({ code: "R02" })).toBe("/static/routes/R02.svg");
    expect(slideBg({ url: "http://example/static/photos/a.jpg" }).backgroundImage).toBe('url("/static/photos/a.jpg")');
  });

  it("opens the matching route from a home slide", () => {
    expect(slideRouteTarget({ routeId: 12 })).toBe("/m/route/12");
    expect(slideRouteTarget({ routeId: "7" })).toBe("/m/route/7");
    expect(slideRouteTarget({ routeId: 0 })).toBe("");
    expect(slideRouteTarget({})).toBe("");
    expect(slideRouteTarget(null)).toBe("");
  });
});
