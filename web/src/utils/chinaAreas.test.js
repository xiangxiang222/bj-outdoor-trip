import { describe, it, expect } from "vitest";
import {
  buildChinaAreaTree,
  chinaAreaOptions,
  findRegionPath,
  formatRegion,
  shortAreaName,
} from "./chinaAreas";

describe("chinaAreas", () => {
  it("shortens province and county suffixes", () => {
    expect(shortAreaName("北京市")).toBe("北京");
    expect(shortAreaName("内蒙古自治区")).toBe("内蒙古");
    expect(shortAreaName("围场满族蒙古族自治县")).toBe("围场");
    expect(shortAreaName("怀柔区")).toBe("怀柔");
  });

  it("flattens municipalities and province-owned counties", () => {
    const beijing = chinaAreaOptions.find((p) => p.value === "北京市");
    expect(beijing.children.map((c) => c.value)).toContain("怀柔区");
    expect(beijing.children.some((c) => c.value === "市辖区")).toBe(false);

    const henan = chinaAreaOptions.find((p) => p.value === "河南省");
    expect(henan.children.map((c) => c.value)).toContain("济源市");
    expect(henan.children.some((c) => c.value === "省直辖县级行政区划")).toBe(false);
  });

  it("builds a tree from raw pca json", () => {
    const tree = buildChinaAreaTree({
      测试省: { 甲市: ["一县"], 市辖区: ["东区"] },
    });
    expect(tree[0].children).toEqual([
      { value: "甲市", label: "甲市", children: [{ value: "一县", label: "一县" }] },
      { value: "东区", label: "东区" },
    ]);
  });

  it("formats a cascader path", () => {
    expect(formatRegion(["河北省", "承德市", "围场满族蒙古族自治县"])).toBe("河北省 / 承德市 / 围场满族蒙古族自治县");
    expect(formatRegion(["北京市", "怀柔区"])).toBe("北京市 / 怀柔区");
    expect(formatRegion([])).toBe("");
  });

  it("maps old seed labels and slash paths back to cascader values", () => {
    expect(findRegionPath("北京怀柔")).toEqual(["北京市", "怀柔区"]);
    expect(findRegionPath("天津蓟州")).toEqual(["天津市", "蓟州区"]);
    expect(findRegionPath("河北承德")).toEqual(["河北省", "承德市"]);
    expect(findRegionPath("河北承德围场")).toEqual(["河北省", "承德市", "围场满族蒙古族自治县"]);
    expect(findRegionPath("河北保定涞源")).toEqual(["河北省", "保定市", "涞源县"]);
    expect(findRegionPath("北京市 / 怀柔区")).toEqual(["北京市", "怀柔区"]);
    expect(findRegionPath("河南济源")).toEqual(["河南省", "济源市"]);
  });

  it("maps extra labels and leaves mixed custom text unmapped", () => {
    expect(findRegionPath("北京周边")).toEqual(["北京周边"]);
    expect(findRegionPath("跨省")).toEqual(["跨省"]);
    expect(findRegionPath("北京房山 / 河北涞水")).toEqual([]);
    expect(findRegionPath("")).toEqual([]);
  });
});
