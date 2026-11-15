import { KindedError } from "@halonicjs/std";
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
      expect(list.changedFileCount).toBe(1);
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
      expect(list.changedFileCount).toBe(1);
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
      expect(await list.createVersion("x", "")).toBe("Unable to create index.lock");
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
