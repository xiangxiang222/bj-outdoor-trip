import { describe, it, expect } from "vitest";
import { layoutWeatherChart } from "./weatherChart";

describe("layoutWeatherChart", () => {
  it("builds a smooth path from hourly temps", () => {
    const hourly = [
      { hour: "06:00", temp: 8 },
      { hour: "09:00", temp: 14 },
      { hour: "12:00", temp: 20 },
      { hour: "15:00", temp: 18 },
      { hour: "18:00", temp: 12 },
    ];
    const layout = layoutWeatherChart(hourly);
    expect(layout.points).toHaveLength(5);
    expect(layout.line.startsWith("M ")).toBe(true);
    expect(layout.line).toContain(" C ");
    expect(layout.points[0].hourLabel).toBe("06");
    expect(layout.points[2].temp).toBe(20);
    expect(layout.points[2].y).toBeLessThan(layout.points[0].y);
  });

  it("returns null without temperatures", () => {
    expect(layoutWeatherChart([])).toBe(null);
  });
});
