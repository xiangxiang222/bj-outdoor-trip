import { beforeEach, describe, expect, it, vi } from "vitest";
import Legal from "./Legal.vue";
import http from "@/api/http";
import reviewBundle from "@/data/legal-review.json";

vi.mock("vue", async (original) => ({ ...(await original()), onMounted: vi.fn(), watch: vi.fn(), useSSRContext: () => ({ modules: new Set() }) }));
vi.mock("vue-router", () => ({ useRoute: () => ({ params: { doc: "privacy" } }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/api/http", () => ({ default: { get: vi.fn() } }));
vi.mock("@/utils/pageChrome", () => ({ setChrome: vi.fn() }));
const bundle = { status: "draft", version: "2026-11-01", documents: [{ id: "privacy", title: "隐私政策", sections: [] }, { id: "terms", title: "用户协议", sections: [] }] };
const setup = () => Legal.setup({ docId: null }, { expose: vi.fn(), emit: vi.fn() });

describe("public legal document viewer", () => {
  beforeEach(() => vi.clearAllMocks());
  it("loads a public deep link from the shared API", async () => {
    http.get.mockResolvedValueOnce({ data: bundle });
    const state = setup();
    await state.load();
    expect(http.get).toHaveBeenCalledWith("/legal");
    expect(state.document.value.title).toBe("隐私政策");
    expect(state.loading.value).toBe(false);
    expect(state.usingReview.value).toBe(false);
  });
  it("settles failure and reuses the retry action", async () => {
    http.get.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: bundle });
    const state = setup();
    await state.load();
    expect(state.error.value).toBe("offline");
    expect(state.loading.value).toBe(false);
    await state.load();
    expect(state.error.value).toBe("");
    expect(state.document.value.id).toBe("privacy");
  });
  it("shows the bundled review only for a missing endpoint", async () => {
    http.get.mockRejectedValueOnce(Object.assign(new Error("HTTP 404"), { status: 404 }));
    const state = setup();
    await state.load();
    expect(state.error.value).toBe("");
    expect(state.loading.value).toBe(false);
    expect(state.usingReview.value).toBe(true);
    expect(state.bundle.value).toEqual(reviewBundle);
    expect(state.bundle.value.status).toBe("draft");
    expect(state.bundle.value.effectiveAt).toBe(null);
    expect(state.bundle.value.reviewOnly).toBe(true);
    expect(state.bundle.value.documents).toHaveLength(7);
    expect(state.document.value.id).toBe("privacy");
    expect(state.document.value.sections.length).toBeGreaterThan(0);
  });
  it("does not substitute a review for outages or an invalid successful response", async () => {
    for (const failure of [new Error("offline"), Object.assign(new Error("unavailable"), { status: 503 }), Object.assign(new Error("not authorized"), { status: 401 })]) {
      http.get.mockRejectedValueOnce(failure);
      const state = setup();
      await state.load();
      expect(state.error.value).toBe(failure.message);
      expect(state.bundle.value).toBe(null);
      expect(state.usingReview.value).toBe(false);
    }
    http.get.mockResolvedValueOnce({ data: {} });
    const state = setup();
    await state.load();
    expect(state.error.value).toMatch(/暂不可用/);
    expect(state.bundle.value).toBe(null);
    expect(state.usingReview.value).toBe(false);
  });
  it("replaces the bundled review with current published text after a successful retry", async () => {
    const published = { ...bundle, status: "published", version: "2026-11-02", effectiveAt: "2026-11-02" };
    http.get.mockRejectedValueOnce(Object.assign(new Error("HTTP 404"), { status: 404 })).mockResolvedValueOnce({ data: published });
    const state = setup();
    await state.load();
    expect(state.usingReview.value).toBe(true);
    await state.load();
    expect(state.bundle.value).toEqual(published);
    expect(state.document.value.title).toBe("隐私政策");
    expect(state.usingReview.value).toBe(false);
    expect(state.error.value).toBe("");
  });
  it("clears the bundled review when a retry reports a different failure", async () => {
    http.get.mockRejectedValueOnce(Object.assign(new Error("HTTP 404"), { status: 404 })).mockRejectedValueOnce(new Error("offline"));
    const state = setup();
    await state.load();
    expect(state.usingReview.value).toBe(true);
    await state.load();
    expect(state.bundle.value).toBe(null);
    expect(state.usingReview.value).toBe(false);
    expect(state.error.value).toBe("offline");
  });
});
