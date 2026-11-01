import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./Login.vue";
import http from "@/api/http";

vi.mock("vue", async (original) => ({ ...(await original()), onMounted: vi.fn(), onUnmounted: vi.fn(), useSSRContext: () => ({ modules: new Set() }) }));
vi.mock("vue-router", () => ({ useRoute: () => ({ query: {}, params: {} }), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/api/http", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/stores/user", () => ({ useUserStore: () => ({ setAuth: vi.fn() }) }));
const bundle = (status = "published") => ({ status, version: "2026-11-01", documents: [{ id: "privacy", sections: [] }, { id: "terms", sections: [] }] });
const setup = () => Login.setup({}, { expose: vi.fn() });

describe("H5 authentication consent", () => {
  beforeEach(() => vi.clearAllMocks());
  it("blocks every account action while policies are missing or unchecked", async () => {
    const state = setup();
    for (const policy of [null, bundle()]) {
      state.legalBundle.value = policy;
      for (const method of ["loginSms", "loginPwd", "register", "wx"]) await state[method]();
      await state.requestCode("login");
    }
    expect(http.post).not.toHaveBeenCalled();
    expect(state.legalAccepted.value).toBe(false);
  });
  it("attaches the published version after an explicit check", async () => {
    const state = setup();
    state.legalBundle.value = bundle();
    state.legalAccepted.value = true;
    http.post.mockResolvedValueOnce({ data: { token: "token", user: {} } });
    await state.wx();
    expect(http.post).toHaveBeenCalledWith("/auth/wechat", expect.objectContaining({ legalConsent: { accepted: true, version: "2026-11-01" } }));
  });
  it("allows draft review without manufacturing an agreement receipt", async () => {
    const state = setup();
    state.legalBundle.value = bundle("draft");
    http.post.mockResolvedValueOnce({ data: { token: "token", user: {} } });
    await state.wx();
    expect(http.post.mock.calls[0][1]).not.toHaveProperty("legalConsent");
  });
  it("keeps failed policy loading blocked and supports retry", async () => {
    const state = setup();
    http.get.mockRejectedValueOnce(new Error("offline"));
    await state.loadLegal();
    expect(state.legalBundle.value).toBe(null);
    expect(state.legalError.value).toBe("offline");
    http.get.mockResolvedValueOnce({ data: bundle() });
    await state.loadLegal();
    expect(state.legalBundle.value.version).toBe("2026-11-01");
    expect(state.legalAccepted.value).toBe(false);
    expect(state.legalLoading.value).toBe(false);
  });
  it("refreshes a changed policy, clears consent, and preserves the form on every account action", async () => {
    for (const method of ["requestCode", "loginSms", "loginPwd", "register", "wx"]) {
      const state = setup();
      state.legalBundle.value = bundle();
      state.legalAccepted.value = true;
      for (const [field, value] of Object.entries({ phone: "13800138000", password: "secret", password2: "secret", nickname: "同行者", captcha: "ABCD", smsCode: "888888" })) state[field].value = value;
      http.post.mockRejectedValueOnce(Object.assign(new Error("changed"), { code: "legal_version_changed" }));
      http.get.mockResolvedValueOnce({ data: { ...bundle(), version: "2026-11-02" } });
      await state[method]("login");
      expect(state.legalBundle.value.version).toBe("2026-11-02");
      expect(state.legalAccepted.value).toBe(false);
      expect(state.phone.value).toBe("13800138000");
      expect(state.password.value).toBe("secret");
      expect(state.captcha.value).toBe("ABCD");
      expect(state.err.value).toMatch(/重新阅读/);
    }
  });
  it("blocks an inconsistent archived version and offers policy retry", async () => {
    const state = setup();
    state.legalBundle.value = bundle();
    state.legalAccepted.value = true;
    http.post.mockRejectedValueOnce(Object.assign(new Error("conflict"), { code: "legal_version_conflict" }));
    await state.wx();
    expect(state.legalBundle.value).toBe(null);
    expect(state.legalAccepted.value).toBe(false);
    expect(state.legalError.value).toMatch(/稍后重新加载/);
    expect(http.get).not.toHaveBeenCalled();
  });
});
