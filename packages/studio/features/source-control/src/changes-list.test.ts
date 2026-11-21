import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Version } from "./api.ts";
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

    it("counts a file changed both staged and unstaged once", async () => {
      const list = new ChangesList(
        fakeSource({
          kind: "ready",
          changes: [
            { path: "models.yaml", status: "modified", staged: true },
            { path: "models.yaml", status: "modified", staged: false },
          ],
        }).source,
      );
      await settle();
      expect(list.changedItemCount).toBe(1);
    });

    it("counts the files of one item once, so the sidebar says 1 change", async () => {
      const list = new ChangesList(
        fakeSource({
          kind: "ready",
          changes: [
            { path: "library/skills/triage/SKILL.md", status: "modified", staged: false },
            { path: "library/skills/triage/checklist.md", status: "untracked", staged: false },
          ],
        }).source,
      );
      await settle();
      expect(list.signal()).toEqual({ mark: "count", value: 1, spoken: "1 change" });
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
      expect(list.changedItemCount).toBe(2);
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
      expect(list.changedItemCount).toBe(2);
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

    it("knows whether the folder has a place to get updates from", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      const list = new ChangesList(fake.source);
      await settle();
      expect(list.state.hasRemote).toBe(false);
      fake.setRemote(true);
      await list.refresh();
      expect(list.state.hasRemote).toBe(true);
    });

    it("gets updates and reads again when the shared copy had newer versions", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.setUpdates({ kind: "got", count: 2, people: ["Sam"] });
      const list = new ChangesList(fake.source);
      await settle();
      fake.answer(twoChanged);
      expect(await list.getUpdates()).toEqual({ kind: "got", count: 2, people: ["Sam"] });
      expect(list.changedItemCount).toBe(2);
      expect(list.state.gettingUpdates).toBe(false);
    });

    it("says it is up to date, and that both sides moved, without changing anything", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      const list = new ChangesList(fake.source);
      await settle();
      expect(await list.getUpdates()).toEqual({ kind: "up-to-date" });
      fake.setUpdates({ kind: "both-moved" });
      expect(await list.getUpdates()).toEqual({ kind: "both-moved" });
    });

    it("gives a reason a person can read when getting updates fails", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.failUpdates(
        new KindedError("unavailable", "you can't reach the shared copy right now."),
      );
      const list = new ChangesList(fake.source);
      await settle();
      expect(await list.getUpdates()).toEqual({
        kind: "failed",
        reason: "You can't reach the shared copy right now.",
      });
      expect(list.state.gettingUpdates).toBe(false);
    });

    it("asks the source once while getting updates is already working", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      const list = new ChangesList(fake.source);
      await settle();
      const [first, second] = await Promise.all([list.getUpdates(), list.getUpdates()]);
      expect(fake.updatesAsked()).toBe(1);
      expect([first.kind, second.kind].sort()).toEqual(["failed", "up-to-date"]);
    });

    it("stops watching and ignores reads once disposed", async () => {
      const fake = fakeSource(twoChanged);
      const list = new ChangesList(fake.source);
      await settle();
      list.dispose();
      expect(fake.listenerCount()).toBe(0);
      fake.answer({ kind: "ready", changes: [] });
      await list.refresh();
      expect(list.changedItemCount).toBe(2);
    });
  });
});

verifies("source-control.create-version", () => {
  describe("ChangesList creating a version", () => {
    async function listWith(...paths: string[]) {
      const fake = fakeSource({
        kind: "ready",
        changes: paths.map((path) => ({ path, status: "modified" as const, staged: false })),
      });
      for (const path of paths) fake.setTexts(path, { before: "a: 1\n", after: "a: 2\n" });
      const list = new ChangesList(fake.source);
      await settle();
      return { fake, list };
    }

    it("opens for every changed file, or only for the paths it is given", async () => {
      const { list } = await listWith("agents/a.agent.yaml", "agents/b.agent.yaml");
      list.startVersion();
      expect(list.versionFiles.map((file) => file.path)).toEqual([
        "agents/a.agent.yaml",
        "agents/b.agent.yaml",
      ]);
      list.startVersion(["agents/b.agent.yaml"]);
      expect(list.versionFiles.map((file) => file.path)).toEqual(["agents/b.agent.yaml"]);
      list.cancelVersion();
      expect(list.versionFiles).toEqual([]);
      expect(list.state.version).toBeUndefined();
    });

    it("records only the files it was opened for, with the name and notes as the message", async () => {
      const { fake, list } = await listWith("agents/a.agent.yaml", "agents/b.agent.yaml");
      list.startVersion(["agents/b.agent.yaml"]);
      expect(await list.createVersion("  First reply\nflow ", "Tone changed.")).toBeUndefined();
      expect(fake.versions).toEqual([
        { message: "First reply flow\n\nTone changed.", paths: ["agents/b.agent.yaml"] },
      ]);
      expect(list.state.version).toBeUndefined();
      expect(list.changedItemCount).toBe(1);
    });

    it("names both paths of a renamed file", async () => {
      const fake = fakeSource({
        kind: "ready",
        changes: [
          {
            path: "agents/new.agent.yaml",
            from: "agents/old.agent.yaml",
            status: "renamed",
            staged: true,
          },
        ],
      });
      fake.setTexts("agents/new.agent.yaml", { before: "a: 1\n", after: "a: 1\n" });
      const list = new ChangesList(fake.source);
      await settle();
      list.startVersion();
      await list.createVersion("Rename", "");
      expect(fake.versions[0]?.paths).toEqual(["agents/new.agent.yaml", "agents/old.agent.yaml"]);
    });

    it("keeps the dialog open and gives git's reason when it refuses", async () => {
      const { fake, list } = await listWith("agents/a.agent.yaml");
      fake.failVersion(new KindedError("unavailable", "Unable to create index.lock"));
      list.startVersion();
      expect(await list.createVersion("x", "")).toBe("Unable to create index.lock.");
      expect(list.state.version).toBeDefined();
    });

    it("says nothing has changed when its files are gone", async () => {
      const { list } = await listWith("agents/a.agent.yaml");
      list.startVersion(["agents/other.agent.yaml"]);
      expect(await list.createVersion("x", "")).toBe(
        "Nothing has changed since your last version.",
      );
    });
  });
});

verifies("source-control.history", () => {
  describe("ChangesList history", () => {
    const versions = (count: number): Version[] =>
      Array.from({ length: count }, (_, i) => ({
        id: `v${count - i}`,
        name: `Version ${count - i}`,
        notes: "",
        author: "Sam",
        at: (count - i) * 1000,
        files: ["a.md"],
      }));
    const opened = async (count: number) => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.setHistory(versions(count));
      const list = new ChangesList(fake.source);
      await settle();
      return { fake, list };
    };

    it("shows the newest 20 versions and knows there are older ones", async () => {
      const { list } = await opened(25);
      const { history } = list.state;
      expect(history.versions.map((v) => v.id)).toEqual(
        versions(25)
          .slice(0, 20)
          .map((v) => v.id),
      );
      expect(history).toMatchObject({ more: true, loaded: true });
    });

    it("shows 20 more, newest first", async () => {
      const { list } = await opened(25);
      await list.showMoreHistory();
      expect(list.state.history.versions).toHaveLength(25);
      expect(list.state.history.versions[0]?.id).toBe("v25");
      expect(list.state.history.more).toBe(false);
    });

    it("keeps the versions already shown when it reads again", async () => {
      const { fake, list } = await opened(45);
      await list.showMoreHistory();
      await list.refresh();
      expect(list.state.history.versions).toHaveLength(40);
      expect(fake.historyLimits.at(-1)).toBe(41);
    });

    it("has no versions, and says it read them, for a repository without one", async () => {
      const { list } = await opened(0);
      expect(list.state.history).toMatchObject({ versions: [], more: false, loaded: true });
    });

    it("keeps the versions and the reason when a later read fails", async () => {
      const { fake, list } = await opened(3);
      fake.failHistory(new KindedError("unavailable", "Locked"));
      await list.refreshHistory();
      expect(list.state.history.versions).toHaveLength(3);
      expect(list.state.history.error).toBeDefined();
      fake.failHistory(undefined);
      await list.refreshHistory();
      expect(list.state.history.error).toBeUndefined();
    });

    it("does not read the history of a folder that isn't a repository", async () => {
      const fake = fakeSource({ kind: "not-a-repository" });
      const list = new ChangesList(fake.source);
      await settle();
      expect(fake.historyLimits).toEqual([]);
      expect(list.state.history.loaded).toBe(false);
    });
  });
});
