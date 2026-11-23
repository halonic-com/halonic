import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { effortForTask, isPaperclipEffort, tagsFromLabels } from "./rules.ts";

const effortOf = (labels: readonly string[], sentBack = false) =>
  effortForTask(tagsFromLabels(labels, sentBack));

verifies("paperclip.task-effort-rules", () => {
  describe("the table from tags to effort", () => {
    test("D1 to D3 code tasks run at low, whatever the case or spaces", () => {
      expect(effortOf(["D1"])).toBe("low");
      expect(effortOf(["D2"])).toBe("low");
      expect(effortOf(["d3 "])).toBe("low");
    });

    test("opus-only work runs at high, by the tag or by its area", () => {
      expect(effortOf(["D1", "opus-only"])).toBe("high");
      expect(effortOf(["D2", "sandbox"])).toBe("high");
      for (const area of [
        "security",
        "trust",
        "schema",
        "secrets",
        "sign-in",
        "oauth",
        "keychain",
      ]) {
        expect(effortOf([area])).toBe("high");
      }
    });

    test("D4 and harder run at high, and the hardest of several tags wins", () => {
      expect(effortOf(["D4"])).toBe("high");
      expect(effortOf(["D5"])).toBe("high");
      expect(effortOf(["D2", "D4"])).toBe("high");
    });

    test("a rerun after a send-back runs at high", () => {
      expect(effortOf(["D3"], true)).toBe("high");
    });

    test("a task without a difficulty or opus-only tag gets nothing, sent back or not", () => {
      expect(effortOf([])).toBeUndefined();
      expect(effortOf(["docs"])).toBeUndefined();
      expect(effortOf(["docs"], true)).toBeUndefined();
      expect(effortOf(["D6", "D0", "D"])).toBeUndefined();
    });

    test("never answers medium, xhigh or max", () => {
      const labelSets = [["D1"], ["D3"], ["D4"], ["D5"], ["opus-only"], ["sandbox", "D5"]];
      for (const labels of labelSets) {
        for (const sentBack of [false, true]) {
          expect(["low", "high"]).toContain(effortOf(labels, sentBack));
        }
      }
    });
  });

  test("knows Paperclip's effort words and nothing else", () => {
    expect(["low", "medium", "high", "xhigh", "max"].every(isPaperclipEffort)).toBe(true);
    expect(isPaperclipEffort("ultra")).toBe(false);
    expect(isPaperclipEffort(3)).toBe(false);
  });
});
