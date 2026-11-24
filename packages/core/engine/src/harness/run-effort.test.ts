import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runEffortForTags } from "./run-effort.ts";

verifies("engine.run-effort-tags", () => {
  it("gives a D1 to D3 task the low effort, whatever the label's case and spaces", () => {
    expect(runEffortForTags({ labels: ["D1"], sentBack: false })).toBe("low");
    expect(runEffortForTags({ labels: ["d2"], sentBack: false })).toBe("low");
    expect(runEffortForTags({ labels: [" D3 ", "docs"], sentBack: false })).toBe("low");
  });

  it("keeps the default for D4 and harder, opus-only work and design", () => {
    for (const label of ["D4", "D5", "opus-only", "design", "security", "sandbox", "keychain"]) {
      expect(runEffortForTags({ labels: [label], sentBack: false })).toBe("default");
    }
  });

  it("keeps the default when a tag that asks for more meets a low difficulty", () => {
    expect(runEffortForTags({ labels: ["D2", "sandbox"], sentBack: false })).toBe("default");
    expect(runEffortForTags({ labels: ["D2", "Opus-Only"], sentBack: false })).toBe("default");
    expect(runEffortForTags({ labels: ["D3", "D4"], sentBack: false })).toBe("default");
    expect(runEffortForTags({ labels: ["D1"], sentBack: true })).toBe("default");
  });

  it("keeps the default for a task without a difficulty tag or with only unknown tags", () => {
    expect(runEffortForTags({ labels: [], sentBack: false })).toBe("default");
    expect(runEffortForTags({ labels: ["docs", "D9"], sentBack: false })).toBe("default");
  });
});
