import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ChangesList } from "./changes-list.ts";
import { fakeSource, settle } from "./source.test-helper.ts";

const twoChanged = {
  kind: "ready",
  changes: [
    { path: "hubs/sales/hub.yaml", status: "modified", staged: false },
    { path: "skills/tone/SKILL.md", status: "untracked", staged: false },
  ],
} as const;

verifies("source-control.changes-page", () => {
  describe("ChangesList", () => {
    it("counts the changed files for the sidebar, and says nothing at zero", async () => {
      const fake = fakeSource(twoChanged);
      const list = new ChangesList(fake.source);
      await settle();
      expect(list.signal()).toEqual({ mark: "count", value: 2, spoken: "2 changes" });

      fake.answer({ kind: "ready", changes: [] });
      await list.refresh();
      expect(list.signal()).toBeUndefined();
    });

    it("reads 1 change in the singular", async () => {
      const list = new ChangesList(
        fakeSource({ kind: "ready", changes: [twoChanged.changes[0]] }).source,
      );
      await settle();
      expect(list.signal()?.spoken).toBe("1 change");
    });

    it("shows no count for a folder without history or without git", async () => {
      const list = new ChangesList(fakeSource({ kind: "not-a-repository" }).source);
      await settle();
      expect(list.signal()).toBeUndefined();
    });

    it("reads again when the window comes to the front", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      const list = new ChangesList(fake.source);
      await settle();
      fake.answer(twoChanged);
      fake.wake();
      await settle();
      expect(list.changedFileCount).toBe(2);
    });

    it("keeps the last answer when a later read fails", async () => {
      const fake = fakeSource(twoChanged);
      const list = new ChangesList(fake.source);
      await settle();
      fake.failReads(new Error("git died"));
      await list.refresh();
      expect(list.state.read).toEqual(twoChanged);
      expect(list.state.error).toBeInstanceOf(Error);
    });

    it("lets only the last read started count", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      const list = new ChangesList(fake.source);
      const first = list.refresh();
      fake.answer(twoChanged);
      await Promise.all([first, list.refresh()]);
      expect(list.changedFileCount).toBe(2);
    });

    it("turns history on and reads again", async () => {
      const fake = fakeSource({ kind: "not-a-repository" });
      const list = new ChangesList(fake.source);
      await settle();
      await list.turnOnHistory();
      expect(fake.turnedOn()).toBe(1);
      expect(list.state.read).toEqual({ kind: "ready", changes: [] });
      expect(list.state.turningOn).toBe(false);
    });

    it("keeps why turning history on failed, and tries again from a clean state", async () => {
      const fake = fakeSource({ kind: "not-a-repository" });
      const list = new ChangesList(fake.source);
      await settle();
      fake.failTurnOn(new Error("no write access"));
      await list.turnOnHistory();
      expect(list.state.turnOnError).toBeInstanceOf(Error);
      expect(list.state.turningOn).toBe(false);
      expect(list.state.read).toEqual({ kind: "not-a-repository" });
    });

    it("stops watching and ignores reads once disposed", async () => {
      const fake = fakeSource(twoChanged);
      const list = new ChangesList(fake.source);
      await settle();
      list.dispose();
      expect(fake.listenerCount()).toBe(0);
      fake.answer({ kind: "ready", changes: [] });
      await list.refresh();
      expect(list.changedFileCount).toBe(2);
    });
  });
});
