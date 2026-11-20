import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ChangesSource } from "./api.ts";
import { restoreItem } from "./restore-item.ts";
import { fakeSource } from "./source.test-helper.ts";

const version = "a".repeat(40);
const sorter = "agents/sorter.agent.yaml";
const prompt = "agents/sorter.prompt.md";

/** A workspace where Sorter's two files changed since `version`. */
function changedSince() {
  const fake = fakeSource({ kind: "ready", changes: [] });
  fake.setTexts(sorter, { before: "model: b\n", after: "model: c\n" });
  fake.setTexts(prompt, { before: "Be brief.\n", after: "Be very brief.\n" });
  fake.setAtVersion(version, sorter, "model: a\n");
  fake.setAtVersion(version, prompt, "Be kind.\n");
  return fake;
}

/** The source, with the second write of `prompt` refused as a file changed on disk would be. */
function refusingPrompt(source: ChangesSource, rollBack: "works" | "fails"): ChangesSource {
  return {
    ...source,
    replaceFile: async (path, text, expected) => {
      if (path === prompt) return "changed-on-disk";
      if (path === sorter && rollBack === "fails" && text === "model: c\n") {
        return "changed-on-disk";
      }
      return source.replaceFile(path, text, expected);
    },
  };
}

verifies("source-control.history-restore", () => {
  describe("restoreItem", () => {
    it("puts each file as the version has it, and Undo puts the newer ones back", async () => {
      const fake = changedSince();
      const outcome = await restoreItem(fake.source, version, [sorter, prompt]);
      expect(await fake.source.readFile(sorter)).toBe("model: a\n");
      expect(await fake.source.readFile(prompt)).toBe("Be kind.\n");
      expect(fake.kept).toEqual([
        [
          { path: sorter, text: "model: c\n" },
          { path: prompt, text: "Be very brief.\n" },
        ],
      ]);
      if (outcome.kind !== "restored") throw new Error(`expected restored, got ${outcome.kind}`);
      expect(await outcome.undo()).toBeUndefined();
      expect(await fake.source.readFile(sorter)).toBe("model: c\n");
      expect(await fake.source.readFile(prompt)).toBe("Be very brief.\n");
    });

    it("deletes a file the version doesn't have", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.setTexts(prompt, { before: null, after: "Be brief.\n" });
      const outcome = await restoreItem(fake.source, version, [prompt]);
      expect(outcome.kind).toBe("restored");
      expect(fake.removed).toEqual([{ path: prompt, expected: "Be brief.\n" }]);
    });

    it("changes nothing for files already as the version has them", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.setTexts(sorter, { before: "model: a\n", after: "model: a\n" });
      fake.setAtVersion(version, sorter, "model: a\n");
      expect(await restoreItem(fake.source, version, [sorter])).toEqual({ kind: "unchanged" });
      expect(fake.replaced).toEqual([]);
    });

    it("changes nothing when no copy can be kept", async () => {
      const fake = changedSince();
      fake.failKeep(new Error("The disk is full."));
      const outcome = await restoreItem(fake.source, version, [sorter, prompt]);
      expect(outcome).toEqual({
        kind: "failed",
        reason: "Halonic couldn't keep a copy of your changes, so nothing was restored.",
      });
      expect(fake.replaced).toEqual([]);
    });

    it("says why when the version can't be read, and changes nothing", async () => {
      const fake = changedSince();
      fake.failAtVersion(new Error("This version isn't in the history."));
      const outcome = await restoreItem(fake.source, version, [sorter]);
      expect(outcome).toEqual({ kind: "failed", reason: "This version isn't in the history." });
      expect(fake.replaced).toEqual([]);
    });

    it("puts the files already restored back when a later one changed on disk", async () => {
      const fake = changedSince();
      const source = refusingPrompt(fake.source, "works");
      const outcome = await restoreItem(source, version, [sorter, prompt]);
      expect(outcome).toEqual({
        kind: "failed",
        reason: "A file changed while Halonic was restoring it.",
      });
      expect(await fake.source.readFile(sorter)).toBe("model: c\n");
    });

    it("names the files not put back when putting them back fails too", async () => {
      const fake = changedSince();
      const source = refusingPrompt(fake.source, "fails");
      const outcome = await restoreItem(source, version, [sorter, prompt]);
      expect(outcome).toEqual({
        kind: "partial",
        reason:
          "A file changed while Halonic was restoring it. A file changed after it was restored.",
        paths: [sorter],
      });
    });
  });
});
