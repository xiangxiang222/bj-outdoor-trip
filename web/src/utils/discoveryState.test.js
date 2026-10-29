import { describe, expect, it } from "vitest";
import { discoveryComparison, discoveryDraft, mergeDiscoveryResults, validateDiscoveryDraft } from "./discoveryState";

describe("discovery result interactions", () => {
  it("preserves a zero fee cap and clears old exact dates when switching back to a weekend", () => {
    const draft = discoveryDraft({ budgetMax: 0, time: "weekend", dateFrom: "2026-11-02", dateTo: "2026-11-02" });
    expect(draft.budgetMax).toBe("0");
    expect(validateDiscoveryDraft(draft, "2026-10-29").filters).toMatchObject({ budgetMax: 0, dateFrom: "", dateTo: "" });
    expect(validateDiscoveryDraft({ ...draft, budgetMax: "" }, "2026-10-29").filters.budgetMax).toBeNull();
  });
  it("rejects reversed, impossible and past dates plus invalid headcounts", () => {
    const base = discoveryDraft({ time: "range", dateFrom: "2026-11-02", dateTo: "2026-11-01" });
    expect(validateDiscoveryDraft(base, "2026-10-29").error).toMatch(/结束/);
    expect(validateDiscoveryDraft({ ...base, dateFrom: "2026-02-30" }, "2026-01-01").error).toMatch(/日期/);
    expect(validateDiscoveryDraft({ ...base, dateFrom: "2026-10-28" }, "2026-10-29").error).toMatch(/日期/);
    expect(validateDiscoveryDraft({ ...base, time: "any", partySize: "" }, "2026-10-29").error).toMatch(/人数/);
    expect(validateDiscoveryDraft({ ...base, time: "any", partySize: "2.5" }, "2026-10-29").error).toMatch(/人数/);
  });
  it("uses the same day for a single date and never mutates the form", () => {
    const draft = discoveryDraft({ time: "date", dateFrom: "2026-11-02", dateTo: "2026-12-05" });
    expect(validateDiscoveryDraft(draft, "2026-10-29").filters.dateTo).toBe("2026-11-02");
    expect(draft.dateTo).toBe("2026-12-05");
  });
  it("deduplicates changed pages by real schedule ids without losing existing results", () => {
    expect(mergeDiscoveryResults([{ id: 1, title: "first" }], [{ id: 1, title: "again" }, { id: 2 }, { id: -1 }, null])).toEqual([{ id: 1, title: "first" }, { id: 2 }]);
  });
  it("compares facts without converting missing amounts or distances to free or zero", () => {
    const missing = discoveryComparison({ id: 1, price: { amount: null }, distanceKm: 0 });
    expect(missing.find((field) => field.label === "人均团费").value).toBe("暂未提供");
    expect(missing.find((field) => field.label === "线路标注里程").value).toBe("暂未提供");
    expect(missing.find((field) => field.label === "报名范围").value).toBe("暂未提供");
    expect(discoveryComparison({ price: { amount: 0 } }).find((field) => field.label === "人均团费").value).toBe("¥0");
    expect(discoveryComparison({ distanceKm: 78 }).find((field) => field.label === "线路标注里程").value).toBe("78 km（类型待核实）");
  });
  it("preserves a full trip's zero places and displays only provided participation facts", () => {
    const facts = discoveryComparison({ remain: 0, participation: { label: "需核验团体资格", reason: "报名需通过团体认证" }, price: { amount: 0 } });
    expect(facts.find((field) => field.label === "当前余位").value).toBe("0");
    expect(facts.find((field) => field.label === "参与条件").value).toBe("需核验团体资格\n报名需通过团体认证");
    expect(facts.find((field) => field.label === "人均团费").value).toBe("¥0");
    const missing = discoveryComparison({ remain: null, participation: null });
    expect(missing.find((field) => field.label === "当前余位").value).toBe("暂未提供");
    expect(missing.find((field) => field.label === "参与条件").value).toBe("暂未提供");
  });
});
