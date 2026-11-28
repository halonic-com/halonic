import type { InboxItem } from "@halonicjs/studio-feature-inbox/api";
import type { ChangesRead } from "@halonicjs/studio-feature-source-control/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FolderFactsFromServices } from "./folder-facts.ts";

/** A service with state that tells its listeners when the test changes it. */
class FakeState<State> {
  readonly #listeners = new Set<() => void>();
  state: State;
  constructor(state: State) {
    this.state = state;
  }
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  set(state: State): void {
    this.state = state;
    for (const listener of this.#listeners) listener();
  }
  get listening(): number {
    return this.#listeners.size;
  }
}

/** A Google setup in the Acme Inbox; `fixed` ones stay to say so and don't wait. */
function setup(account: string, fixed = false): InboxItem {
  return {
    kind: "setup",
    key: `setup:google:${account}`,
    provider: "google",
    account,
    title: "Set up Google",
    progress: "Step 1 of 7",
    changedAt: "2026-11-27T10:00:00Z",
    fixed,
  };
}

function setUp() {
  const changes = new FakeState<{ read: ChangesRead | undefined }>({ read: undefined });
  const runs = new FakeState<{ runs: readonly unknown[] }>({ runs: [] });
  const inbox = new FakeState<{ items: readonly InboxItem[] }>({ items: [] });
  const facts = new FolderFactsFromServices({ changes, runs, inbox });
  let told = 0;
  const listen = () =>
    facts.subscribe(() => {
      told += 1;
    });
  return { changes, runs, inbox, facts, listen, told: () => told };
}

verifies("studio.folder-facts", () => {
  describe("git state", () => {
    it.each([
      ["ready", "repository"],
      ["not-a-repository", "not-a-repository"],
      ["no-git", "no-git-program"],
      ["nested-repository", "inside-a-larger-repository"],
    ] as const)("names the history's %s as %s", (kind, expected) => {
      const folder = setUp();
      folder.listen();
      folder.changes.set({ read: kind === "ready" ? { kind, changes: [] } : { kind } });
      expect(folder.facts.facts.git).toBe(expected);
    });

    it("changes when history is turned on, without the window coming to the front", () => {
      const folder = setUp();
      folder.listen();
      folder.changes.set({ read: { kind: "not-a-repository" } });
      folder.changes.set({ read: { kind: "ready", changes: [] } });
      expect(folder.facts.facts.git).toBe("repository");
      expect(folder.told()).toBe(2);
    });

    it("keeps the last state while the history has no answer", () => {
      const folder = setUp();
      folder.listen();
      folder.changes.set({ read: { kind: "no-git" } });
      folder.changes.set({ read: undefined });
      expect(folder.facts.facts.git).toBe("no-git-program");
    });
  });

  describe("runs", () => {
    it("says runs are recorded once the Runs list has one, and tells the rail once", () => {
      const folder = setUp();
      folder.listen();
      folder.runs.set({ runs: [{}] });
      folder.runs.set({ runs: [{}, {}] });
      expect(folder.facts.facts.runsRecorded).toBe(true);
      expect(folder.told()).toBe(1);
    });

    it("shows a run that started before the rail listened as soon as it does", () => {
      const folder = setUp();
      folder.runs.state = { runs: [{}] };
      folder.listen();
      expect(folder.facts.facts.runsRecorded).toBe(true);
    });
  });

  describe("Inbox", () => {
    it("counts what waits, tells the rail once, and leaves a fixed setup out", () => {
      const folder = setUp();
      folder.listen();
      folder.inbox.set({ items: [setup("acme-1"), setup("acme-2", true)] });
      expect(folder.facts.facts.waitingCount).toBe(1);
      expect(folder.told()).toBe(1);
    });

    it("counts nothing without an Inbox", () => {
      const facts = new FolderFactsFromServices({
        changes: undefined,
        runs: undefined,
        inbox: undefined,
      });
      expect(facts.facts).toEqual({
        kind: "workspace-project",
        hasItems: true,
        hasCodeFolderInside: false,
        git: "repository",
        runsRecorded: false,
        waitingCount: 0,
      });
    });
  });

  describe("listening", () => {
    it("keeps the same facts object while nothing changed", () => {
      const folder = setUp();
      folder.listen();
      const before = folder.facts.facts;
      folder.runs.set({ runs: [] });
      expect(folder.facts.facts).toBe(before);
    });

    it("stops listening to the history, the Runs list and the Inbox once the rail stops", () => {
      const folder = setUp();
      const stop = folder.listen();
      stop();
      expect(
        [folder.changes, folder.runs, folder.inbox].map((service) => service.listening),
      ).toEqual([0, 0, 0]);
    });
  });
});
