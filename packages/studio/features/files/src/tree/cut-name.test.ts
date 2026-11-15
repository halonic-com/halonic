import { describe, expect, it } from "vitest";
import { cutInMiddle } from "./cut-name.ts";

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
