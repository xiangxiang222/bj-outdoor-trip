import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";
import { legalAuthPayload, legalGuardMessage, safeLegalUrl, validateLegalBundle } from "./legal";

const native = createRequire(import.meta.url)("../../../miniprogram/utils/legal");
const bundle = (status = "published") => ({ status, version: "2026-11-01", documents: [{ id: "privacy", sections: [] }, { id: "terms", sections: [] }] });

for (const [name, api] of [["H5", { legalAuthPayload, legalGuardMessage, validateLegalBundle }], ["小程序", native]]) {
  describe(name + " legal consent contract", () => {
    it("blocks missing policies and unchecked published policies", () => {
      expect(api.legalGuardMessage(null, true)).toMatch(/加载协议/);
      expect(() => api.legalAuthPayload(bundle(), false)).toThrow(/勾选/);
      expect(api.legalAuthPayload(bundle(), true)).toEqual({ legalConsent: { accepted: true, version: "2026-11-01" } });
    });
    it("keeps review drafts out of consent evidence and rejects malformed responses", () => {
      expect(api.legalAuthPayload(bundle("draft"), false)).toEqual({});
      for (const invalid of [null, {}, { ...bundle(), status: "unexpected" }, { ...bundle(), version: "" }, { ...bundle(), documents: [] }]) {
        expect(() => api.validateLegalBundle(invalid)).toThrow(/暂不可用/);
      }
      expect(api.validateLegalBundle(bundle())).toEqual(bundle());
    });
    it("never uses a bundled read-only review as authentication authority", () => {
      const review = { ...bundle("draft"), reviewOnly: true };
      expect(() => api.legalAuthPayload(review, true)).toThrow(/审阅副本/);
      expect(() => api.legalAuthPayload(review, false)).toThrow(/审阅副本/);
    });
  });
}

it("limits external policy links to web URLs", () => {
  expect(safeLegalUrl("https://example.com/privacy")).toBe("https://example.com/privacy");
  expect(safeLegalUrl("javascript:alert(1)")).toBe("");
});

function nativeLogin(request) {
  const filename = new URL("../../../miniprogram/pages/login/login.js", import.meta.url);
  let definition;
  const wx = { showToast: vi.fn(), showModal: vi.fn(), showLoading: vi.fn(), hideLoading: vi.fn(), login: vi.fn(async () => ({ code: "login-code" })), navigateTo: vi.fn() };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    Page(value) { definition = value; }, wx, clearInterval, setInterval,
    require(id) {
      if (id.endsWith("/request")) return { request, setAuth: vi.fn() };
      if (id.endsWith("/captcha")) return { saveCaptchaFile: vi.fn() };
      if (id.endsWith("/legal")) return native;
      throw new Error(id);
    },
  });
  const page = { ...definition, data: structuredClone(definition.data), setData(patch) { Object.assign(this.data, patch); }, after: vi.fn() };
  Object.assign(page.data, { phone: "13800138000", password: "password", password2: "password", nickname: "同行者", captcha: "ABCD", smsCode: "888888" });
  return { page, wx };
}

describe("native authentication consent boundaries", () => {
  it("blocks every authentication path and SMS before loading and before a published opt-in", async () => {
    const request = vi.fn();
    const { page, wx } = nativeLogin(request);
    for (const policy of [null, bundle()]) {
      page.data.legalBundle = policy;
      for (const method of ["sendSms", "smsLogin", "pwdLogin", "register", "onGetPhone"]) await page[method]({ currentTarget: { dataset: {} }, detail: { code: "phone-code", errMsg: "ok" } });
    }
    expect(request).not.toHaveBeenCalled();
    expect(wx.login).not.toHaveBeenCalled();
  });
  it("sends the viewed policy version on a successful native phone authorization", async () => {
    const request = vi.fn(async () => ({ data: {} }));
    const { page } = nativeLogin(request);
    page.data.legalBundle = bundle();
    page.toggleLegal({ detail: { value: ["accepted"] } });
    expect(page.data.legalAllowed).toBe(true);
    await page.onGetPhone({ detail: { code: "phone-code", errMsg: "ok" } });
    expect(request).toHaveBeenCalledWith("/auth/wechat-phone", "POST", expect.objectContaining({ legalConsent: { accepted: true, version: "2026-11-01" } }));
  });
  it("resets authorization while retrying and keeps malformed policies blocked", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: bundle("draft") });
    const { page } = nativeLogin(request);
    await page.loadLegal();
    expect(page.data.legalAllowed).toBe(false);
    expect(page.data.legalError).toBe("offline");
    await page.loadLegal();
    expect(page.data.legalAllowed).toBe(false);
    await page.loadLegal();
    expect(page.data.legalAllowed).toBe(true);
    expect(page.data.legalAccepted).toBe(false);
    expect(page.legalPayload()).toEqual({});
  });
  it("keeps native authentication blocked when the deployed legal endpoint returns 404", async () => {
    const request = vi.fn().mockRejectedValueOnce(Object.assign(new Error("HTTP 404"), { status: 404 }));
    const { page, wx } = nativeLogin(request);
    await page.loadLegal();
    await page.sendSms({ currentTarget: { dataset: { scene: "login" } } });
    await page.onGetPhone({ detail: { code: "phone-code", errMsg: "ok" } });
    expect(page.data.legalBundle).toBe(null);
    expect(page.data.legalAllowed).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(wx.login).not.toHaveBeenCalled();
  });
  it("reloads a changed version without clearing the form on every native account action", async () => {
    for (const method of ["sendSms", "smsLogin", "pwdLogin", "register", "onGetPhone"]) {
      const request = vi.fn().mockRejectedValueOnce(Object.assign(new Error("changed"), { code: "legal_version_changed" })).mockResolvedValueOnce({ data: { ...bundle(), version: "2026-11-02" } });
      const { page } = nativeLogin(request);
      page.data.legalBundle = bundle();
      page.data.legalAccepted = true;
      await page[method]({ currentTarget: { dataset: { scene: "login" } }, detail: { code: "phone-code", errMsg: "ok" } });
      expect(page.data.legalBundle.version).toBe("2026-11-02");
      expect(page.data.legalAccepted).toBe(false);
      expect(page.data.legalAllowed).toBe(false);
      expect(page.data.phone).toBe("13800138000");
      expect(page.data.password).toBe("password");
      expect(page.data.captcha).toBe("ABCD");
      expect(request.mock.calls[1][0]).toBe("/legal");
    }
  });
  it("blocks an inconsistent native policy version until a successful reload", async () => {
    const request = vi.fn().mockRejectedValueOnce(Object.assign(new Error("conflict"), { code: "legal_version_conflict" }));
    const { page } = nativeLogin(request);
    page.data.legalBundle = bundle();
    page.data.legalAccepted = true;
    await page.onGetPhone({ detail: { code: "phone-code", errMsg: "ok" } });
    expect(page.data.legalBundle).toBe(null);
    expect(page.data.legalAllowed).toBe(false);
    expect(page.data.legalAccepted).toBe(false);
    expect(page.data.legalError).toMatch(/稍后重新加载/);
  });
});
