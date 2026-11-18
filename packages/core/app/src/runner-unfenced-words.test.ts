import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runnerUnfencedReasons } from "./runner-fence.ts";
import { runnerUnfencedWords } from "./runner-unfenced-words.ts";
import { sandboxStartWords } from "./sandbox-start-words.ts";

verifies("app.runner-unfenced-words", () => {
  describe("windows (R3)", () => {
    it("names whose code can't run, and points to WSL 2", () => {
      expect(runnerUnfencedWords("windows", "plugin")).toEqual({
        key: "runner-unfenced.windows",
        reason: "On Windows, plugin code can't run in the sandbox in this version of Halonic.",
        fix: "Use Halonic inside WSL 2 on this computer.",
        docsKey: "security/sandbox/#windows-preview",
        docsLabel: "How to run Halonic in WSL 2",
      });
      expect(runnerUnfencedWords("windows", "integration").reason).toBe(
        "On Windows, integration code can't run in the sandbox in this version of Halonic.",
      );
    });
  });

  it("uses 23.3's reason and fix word for word for the sandbox's own reasons", () => {
    for (const code of ["container", "user-namespaces-restricted", "bubblewrap-missing", "other"]) {
      const words = runnerUnfencedWords(code, "plugin");
      expect(words.reason).toBe(sandboxStartWords(code).reason);
      expect(words.fix).toBe(sandboxStartWords(code).calloutFix);
      expect(words.docsKey).toBe(sandboxStartWords(code).docsKey);
    }
    expect(runnerUnfencedWords("bubblewrap-missing", "plugin").docsLabel).toBe(
      "How to install bubblewrap",
    );
  });

  it("names the person's choice for no-sandbox, never as a missing sandbox", () => {
    const words = runnerUnfencedWords("no-sandbox", "integration");
    expect(words).toEqual({
      key: "runner-unfenced.no-sandbox",
      reason: "You chose to continue without a sandbox on this computer.",
      fix: "Set up a sandbox in Settings › Agent sandbox.",
      docsKey: "security/sandbox/",
      docsLabel: "What the sandbox does",
    });
    expect(words.reason).not.toBe(sandboxStartWords("other").reason);
  });

  it("has a reason, a fix and a docs link for every reason, under a key of its own", () => {
    const keys = new Set<string>();
    for (const code of runnerUnfencedReasons) {
      const words = runnerUnfencedWords(code, "plugin");
      for (const part of [words.reason, words.fix, words.docsLabel]) {
        expect(part.length).toBeGreaterThan(0);
        expect(part).not.toMatch(/\b(safe|verified|scanned|secure|protected|guaranteed)\b/i);
      }
      expect(words.docsKey.startsWith("security/sandbox/")).toBe(true);
      keys.add(words.key);
    }
    expect(keys.size).toBe(runnerUnfencedReasons.length);
  });

  it("reads a code from a newer version as other", () => {
    for (const code of ["from-the-future", "", "__proto__"]) {
      expect(runnerUnfencedWords(code, "plugin")).toEqual(runnerUnfencedWords("other", "plugin"));
    }
  });
});
