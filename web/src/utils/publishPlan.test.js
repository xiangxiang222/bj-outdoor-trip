import { describe, expect, it } from "vitest";
import { campusAudienceSummary, campusTargetsForPlan, prepareActivityPayload, prepareSchedulePayload, validatePublishPlan } from "./publishPlan";

const plan = (extra = {}) => ({
  channel: "trip", routeId: 12, startDate: "2026-11-02", organizerType: "campus", companyName: "北京大学",
  campusScope: "school", campusSchool: "北京大学", campusCollege: "计算机学院", campusTargets: [],
  busTypeId: 1, minGroupSize: 10, meetupPoint: "东直门", meetupTime: "07:30", offerType: "full", ...extra,
});
const options = { today: "2026-10-27", buses: [{ id: 1, seats: 30 }] };

describe("publishing a trip", () => {
  it("binds cross-college selections to their school and removes duplicate names", () => {
    const result = prepareSchedulePayload(plan({ campusScope: "colleges", colleges: "计算机学院，法学院，计算机学院" }));
    expect(result.campusTargets).toEqual([
      { school: "北京大学", college: "计算机学院", major: "" },
      { school: "北京大学", college: "法学院", major: "" },
    ]);
    expect(result.studentOnly).toBe(true);
    expect(result.campusScope).toBeUndefined();
  });
  it("keeps same-named colleges at different schools separate through serialization", () => {
    const form = plan({ campusScope: "schools", campusTargets: [
      { school: "北京大学", college: "计算机学院", major: "软件工程" },
      { school: "清华大学", college: "计算机学院", major: "" },
    ] });
    expect(prepareSchedulePayload(form).campusTargets).toEqual(form.campusTargets);
    expect(campusAudienceSummary(form)).toContain("清华大学 · 计算机学院");
    expect(validatePublishPlan(form, options)).toBe("");
  });
  it("keeps the default free campus scope limited to its host school", () => {
    const form = plan({ campusScope: "school", offerType: "free" });
    expect(campusTargetsForPlan(form)).toEqual([{ school: "北京大学", college: "", major: "" }]);
    expect(prepareSchedulePayload(form)).toMatchObject({ studentOnly: true, oversub: true });
    expect(campusAudienceSummary(form)).toContain("北京大学");
  });
  it("keeps a free campus trip's open scope on its host school", () => {
    const form = plan({ campusScope: "open", offerType: "free" });
    expect(campusTargetsForPlan(form)).toEqual([{ school: "北京大学", college: "", major: "" }]);
    expect(prepareSchedulePayload(form)).toMatchObject({ campusTargets: [{ school: "北京大学", college: "", major: "" }], studentOnly: true, oversub: true });
    expect(campusAudienceSummary(form)).toContain("北京大学");
  });
  it("preserves an explicit all-verified-campus choice for a free trip", () => {
    const form = plan({ campusScope: "certified", offerType: "free" });
    expect(prepareSchedulePayload(form)).toMatchObject({ campusScope: "certified", campusTargets: [], studentOnly: true });
    expect(campusAudienceSummary(form)).toContain("不限学校");
  });
  it("removes campus restrictions and stale passwords when switching to a company trip", () => {
    const result = prepareSchedulePayload(plan({ organizerType: "company", privateJoin: false, joinCode: "OLD-CODE", studentOnly: true }));
    expect(result).toMatchObject({ campusTargets: [], studentOnly: false, alumniOk: false, oversub: false, joinCode: "" });
  });
  it("lets an explicit open scope clear a previous student-only setting", () => {
    const form = plan({ campusScope: "open", studentOnly: true });
    expect(prepareSchedulePayload(form)).toMatchObject({ campusTargets: [], studentOnly: false });
    expect(campusAudienceSummary(form)).toBe("所有人均可报名");
  });
  it("rejects an impossible date, incomplete targets and a group larger than its bus", () => {
    expect(validatePublishPlan(plan({ startDate: "2026-02-30" }), options)).toContain("有效");
    expect(validatePublishPlan(plan({ startDate: "2026-10-26" }), options)).toContain("早于");
    expect(validatePublishPlan(plan({ campusScope: "schools", campusTargets: [{ school: "", college: "计算机学院" }] }), options)).toContain("补全");
    expect(validatePublishPlan(plan({ minGroupSize: 31 }), options)).toContain("30");
  });
  it("validates each step without blocking earlier steps on later fields", () => {
    expect(validatePublishPlan(plan({ busTypeId: "" }), { ...options, step: 0 })).toBe("");
    expect(validatePublishPlan(plan({ busTypeId: "" }), { ...options, step: 2 })).toContain("车型");
  });
  it("requires an approved student or student group before opening a combo trip", () => {
    const form = plan({ offerType: "combo" });
    expect(validatePublishPlan(form, { ...options, step: 0 })).toContain("已认证");
    expect(validatePublishPlan(form, { ...options, profile: { isStudent: true } })).toBe("");
    expect(validatePublishPlan(form, { ...options, profile: { groupStatus: "approved" } })).toBe("");
  });
  it("publishes paid activities with a paid offer instead of inheriting the free default", () => {
    expect(prepareActivityPayload({ originPrice: 99, offerType: "free" })).toMatchObject({ channel: "activity", offerType: "full", originPrice: 99 });
    expect(prepareActivityPayload({ originPrice: 0, offerType: "full" }).offerType).toBe("free");
    expect(validatePublishPlan({ channel: "activity", meetupPoint: "公园", city: "朝阳", minGroupSize: 12, maxSeats: 10, originPrice: 0 }, { step: 1 })).toContain("人数上限");
  });
});
