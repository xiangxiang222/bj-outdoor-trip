import { describe, it, expect, beforeEach, vi } from "vitest";
import { visitorId, pulsePath, pulseFace } from "./pulse";

describe("pulse helpers", () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    });
  });

  it("reuses the same visitor id and builds ticker links", () => {
    const a = visitorId();
    const b = visitorId();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(pulsePath({ kind: "enroll", scheduleId: 9, routeId: 1 })).toBe("/m/schedule/9");
    expect(pulsePath({ kind: "view", routeId: 4 })).toBe("/m/route/4");
    expect(pulsePath({ kind: "favorite", href: "/m/route/2", routeId: 2 })).toBe("/m/route/2");
    expect(pulseFace("林**")).toBe("林");
    expect(pulseFace("")).toBe("同");
  });
});
