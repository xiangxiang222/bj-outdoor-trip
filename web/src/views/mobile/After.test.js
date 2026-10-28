import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "@/api/http";
import After from "./After.vue";

vi.mock("vue", async (importOriginal) => {
  const vue = await importOriginal();
  return { ...vue, onMounted: vi.fn(), useSSRContext: () => ({ modules: new Set() }) };
});
vi.mock("vue-router", () => ({ useRoute: () => ({ params: { id: "31" } }), useRouter: () => ({}) }));
vi.mock("@/stores/user", () => ({ useUserStore: () => ({}) }));
vi.mock("@/api/http", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const setupPage = () => After.setup({}, { expose: vi.fn() });

describe("trip recap loading and retry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("settles an initial failure into an error and retries both recap requests", async () => {
    http.get.mockRejectedValueOnce(new Error("网络暂不可用"));
    const state = setupPage();
    await state.load();
    expect(state.s.value).toBe(null);
    expect(state.loading.value).toBe(false);
    expect(state.loadError.value).toBe("网络暂不可用");

    http.get.mockResolvedValueOnce({ data: { id: 31, title: "行程回顾" } }).mockResolvedValueOnce({ data: [{ id: 2 }] });
    state.msg.value = "评价已提交";
    await state.load();
    expect(state.s.value.id).toBe(31);
    expect(state.posts.value[0].id).toBe(2);
    expect(state.loadError.value).toBe("");
    expect(state.msg.value).toBe("评价已提交");
    expect(http.get.mock.calls.map(([url]) => url)).toEqual(["/schedules/31/after", "/schedules/31/after", "/schedules/31/contest"]);
  });

  it("preserves loaded recap details when only the contest request fails", async () => {
    http.get.mockResolvedValueOnce({ data: { id: 31, title: "行程回顾" } }).mockRejectedValueOnce(new Error("评选暂不可用"));
    const state = setupPage();
    await state.load();
    expect(state.s.value.id).toBe(31);
    expect(state.loadError.value).toBe("评选暂不可用");
    expect(state.loading.value).toBe(false);
  });

  it("sends one pair of recap requests when retry is clicked repeatedly", async () => {
    let finish;
    http.get.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce({ data: [] });
    const state = setupPage();
    const first = state.load();
    await state.load();
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(state.loading.value).toBe(true);
    finish({ data: { id: 31 } });
    await first;
    expect(http.get).toHaveBeenCalledTimes(2);
    expect(state.loading.value).toBe(false);
  });
});
