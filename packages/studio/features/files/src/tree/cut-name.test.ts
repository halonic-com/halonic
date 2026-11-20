import { describe, expect, it } from "vitest";
import { cutInMiddle, cutToWidth } from "./cut-name.ts";

describe("cutInMiddle", () => {
  it("leaves a name that fits", () => {
    expect(cutInMiddle("hub.yaml", 20)).toBe("hub.yaml");
    expect(cutInMiddle("hub.yaml", 8)).toBe("hub.yaml");
  });

  it("keeps the start and the ending, so the extension stays readable", () => {
    const cut = cutInMiddle("support-triage-agent.agent.yaml", 16);
    expect(cut).toHaveLength(16);
    expect(cut.startsWith("support")).toBe(true);
    expect(cut.endsWith(".yaml")).toBe(true);
    expect(cut).toContain("…");
  });

  it("copes with a limit too small for any text", () => {
    expect(cutInMiddle("hub.yaml", 1)).toBe("…");
    expect(cutInMiddle("hub.yaml", 0)).toBe("");
  });
});

describe("cutToWidth", () => {
  /** A font where "w" is twice as wide as other letters, as in a font that isn't monospaced. */
  const widthOf = (text: string) => [...text].reduce((sum, c) => sum + (c === "w" ? 16 : 8), 0);

  it("leaves a name that fits", () => {
    expect(cutToWidth("hub.yaml", 64, widthOf)).toBe("hub.yaml");
  });

  it("cuts the middle to the longest text whose width fits", () => {
    const cut = cutToWidth("weekly-report.workflow.yaml", 96, widthOf);
    expect(cut).toBe("weekl….yaml");
    expect(widthOf(cut)).toBeLessThanOrEqual(96);
    expect(widthOf(cutInMiddle("weekly-report.workflow.yaml", cut.length + 1))).toBeGreaterThan(96);
    expect(cutToWidth("quarterly-board-report.routine.yaml", 96, widthOf)).toBe("quart…e.yaml");
  });

  it("copes with no room at all", () => {
    expect(cutToWidth("hub.yaml", 4, widthOf)).toBe("");
  });
});
