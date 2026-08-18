import { describe, it, expect, vi } from "vitest";
import { requireLogin } from "./auth";

describe("requireLogin", () => {
  it("allows access when token exists", () => {
    expect(requireLogin({ token: "abc" }, { replace: vi.fn() }, { fullPath: "/m/orders" })).toBe(true);
  });

  it("replaces to login with redirect query when logged out", () => {
    const router = { replace: vi.fn() };
    expect(requireLogin({ token: "" }, router, { fullPath: "/m/orders" })).toBe(false);
    expect(router.replace).toHaveBeenCalledWith({
      path: "/m/login",
      query: { redirect: "/m/orders" },
    });
  });

  it("falls back to /m/mine when fullPath is missing", () => {
    const router = { replace: vi.fn() };
    requireLogin({ token: null }, router, {});
    expect(router.replace).toHaveBeenCalledWith({
      path: "/m/login",
      query: { redirect: "/m/mine" },
    });
  });
});
