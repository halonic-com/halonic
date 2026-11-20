import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ChangesSource, Version } from "./api.ts";
import { goBack, putAsVersion, sharedAfter } from "./go-back.ts";
import { fakeSource } from "./source.test-helper.ts";

const version = "a".repeat(40);
const sorter = "agents/sorter.agent.yaml";
const triage = "agents/triage.agent.yaml";

/** A workspace where Sorter changed since `version` and Triage is new since; nothing unversioned. */
function changedSince() {
  const fake = fakeSource({ kind: "ready", changes: [] });
  fake.setTexts(sorter, { before: "model: b\n", after: "model: b\n" });
  fake.setTexts(triage, { before: "model: t\n", after: "model: t\n" });
  fake.setAtVersion(version, sorter, "model: a\n");
  return fake;
}

/** The source, with every write of `triage` refused as a file changed on disk would be. */
function refusingTriage(source: ChangesSource, rollBack: "works" | "fails"): ChangesSource {
  return {
    ...source,
    removeFile: async (path, expected) =>
      path === triage ? "changed-on-disk" : source.removeFile(path, expected),
    replaceFile: async (path, text, expected) => {
      if (path === sorter && rollBack === "fails" && text === "model: b\n") {
        return "changed-on-disk";
      }
      return source.replaceFile(path, text, expected);
    },
  };
}

verifies("source-control.history-go-back", () => {
  describe("goBack", () => {
    it("puts every file as the version has it, deleting what it lacks, and Undo puts them back", async () => {
      const fake = changedSince();
      const outcome = await goBack(fake.source, version);
      expect(await fake.source.readFile(sorter)).toBe("model: a\n");
      expect(await fake.source.readFile(triage)).toBeNull();
      expect(fake.versions).toEqual([]);
      if (outcome.kind !== "restored") throw new Error(`expected restored, got ${outcome.kind}`);
      expect(await outcome.undo()).toBeUndefined();
      expect(await fake.source.readFile(sorter)).toBe("model: b\n");
      expect(await fake.source.readFile(triage)).toBe("model: t\n");
    });

    it('first keeps the changes not in a version yet as "Before going back"', async () => {
      const fake = changedSince();
      fake.setTexts(sorter, { before: "model: b\n", after: "model: c\n" });
      fake.answer({
        kind: "ready",
        changes: [
          { path: sorter, status: "modified", staged: false },
          { path: "c.md", from: "b.md", status: "renamed", staged: false },
        ],
      });
      await goBack(fake.source, version);
      expect(fake.versions).toEqual([
        { message: "Before going back", paths: [sorter, "c.md", "b.md"] },
      ]);
      expect(await fake.source.readFile(sorter)).toBe("model: a\n");
    });

    it('keeps no "Before going back" when every file already is as the version has it', async () => {
      const fake = changedSince();
      const sorterChanged = () =>
        fake.answer({
          kind: "ready",
          changes: [{ path: sorter, status: "modified", staged: false }],
        });
      sorterChanged();
      expect((await goBack(fake.source, version)).kind).toBe("restored");
      expect(fake.versions).toHaveLength(1);

      // A second press: Sorter shows as a change again, as the files that went back do, but every
      // file is the version's now, so nothing is kept or written.
      sorterChanged();
      const outcome = await goBack(fake.source, version);
      expect(outcome.kind).toBe("unchanged");
      expect(fake.versions).toHaveLength(1);
      expect(fake.replaced).toHaveLength(1);
      expect(fake.removed).toHaveLength(1);
    });

    it('changes no file when "Before going back" can\'t be kept', async () => {
      const fake = changedSince();
      fake.answer({
        kind: "ready",
        changes: [{ path: sorter, status: "modified", staged: false }],
      });
      fake.failVersion(new Error("Halonic couldn't record the version."));
      const outcome = await goBack(fake.source, version);
      expect(outcome.kind).toBe("failed");
      expect(fake.replaced).toEqual([]);
      expect(fake.removed).toEqual([]);
    });

    it("changes no file when the version can't be read", async () => {
      const fake = changedSince();
      fake.failAtVersion(new Error("no such version"));
      expect((await goBack(fake.source, version)).kind).toBe("failed");
      expect(fake.replaced).toEqual([]);
    });

    it("puts the files back when one fails, and says which stay when that fails too", async () => {
      const works = changedSince();
      const failed = await goBack(refusingTriage(works.source, "works"), version);
      expect(failed.kind).toBe("failed");
      expect(await works.source.readFile(sorter)).toBe("model: b\n");

      const fails = changedSince();
      const partial = await goBack(refusingTriage(fails.source, "fails"), version);
      if (partial.kind !== "partial") throw new Error(`expected partial, got ${partial.kind}`);
      expect(partial.paths).toEqual([sorter]);
    });

    it("on Try again writes only what still differs, keeping no version first", async () => {
      const fake = changedSince();
      await fake.source.replaceFile(sorter, "model: a\n", "model: b\n");
      fake.answer({
        kind: "ready",
        changes: [{ path: sorter, status: "modified", staged: false }],
      });
      const outcome = await putAsVersion(fake.source, version);
      expect(outcome.kind).toBe("restored");
      expect(fake.versions).toEqual([]);
      expect(fake.removed).toEqual([{ path: triage, expected: "model: t\n" }]);
    });
  });

  describe("sharedAfter", () => {
    const at = (id: string): Version => ({
      id,
      name: id,
      notes: "",
      author: "Sam",
      at: 0,
      files: [],
    });
    const history = [at("c"), at("b"), at(version)];
    const state = (hasRemote: boolean, unshared: readonly string[]) => ({
      hasRemote,
      unsharedIds: new Set(unshared),
      history: { versions: history, more: false, loaded: true, error: undefined },
    });

    it("is true when a newer version is in the shared copy", () => {
      expect(sharedAfter(state(true, ["c"]), version)).toBe(true);
    });

    it("is false when every newer version is unshared, or there is no shared copy", () => {
      expect(sharedAfter(state(true, ["c", "b"]), version)).toBe(false);
      expect(sharedAfter(state(false, []), version)).toBe(false);
      expect(sharedAfter(state(true, []), "c")).toBe(false);
    });
  });
});
