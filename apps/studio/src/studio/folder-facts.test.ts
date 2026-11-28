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

/** A history whose next answer the test sets, as git would give it. */
class FakeHistory {
  answer: ChangesRead | Error = { kind: "ready", changes: [] };
  readonly #listeners = new Set<() => void>();
  read = async (): Promise<ChangesRead> => {
    if (this.answer instanceof Error) throw this.answer;
    return this.answer;
  };
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  bringToFront(): void {
    for (const listener of this.#listeners) listener();
  }
}

/** Lets the history's read and the facts' update settle: a few turns of the promise queue. */
async function settled(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
}

function setUp() {
  const changes = new FakeHistory();
  const runs = new FakeState<{ runs: readonly unknown[] }>({ runs: [] });
  const inbox = new FakeState<{ items: readonly never[] }>({ items: [] });
  const errors: unknown[] = [];
  const facts = new FolderFactsFromServices({ changes, runs, inbox }, (error) =>
    errors.push(error),
  );
  let told = 0;
  const stop = facts.subscribe(() => {
    told += 1;
  });
  return { changes, runs, facts, errors, stop, told: () => told };
}

verifies("studio.folder-facts", () => {
  describe("git state", () => {
    it.each([
      ["ready", "repository"],
      ["not-a-repository", "not-a-repository"],
      ["no-git", "no-git-program"],
      ["nested-repository", "inside-a-larger-repository"],
    ] as const)("names the history's %s as %s", async (kind, expected) => {
      const folder = setUp();
      folder.changes.answer = kind === "ready" ? { kind, changes: [] } : ({ kind } as ChangesRead);
      folder.changes.bringToFront();
      await settled();
      expect(folder.facts.facts.git).toBe(expected);
    });

    it("keeps the last git state and reports the error when the history can't be read", async () => {
      const folder = setUp();
      folder.changes.answer = { kind: "not-a-repository" };
      folder.changes.bringToFront();
      await settled();
      folder.changes.answer = new Error("git crashed");
      folder.changes.bringToFront();
      await settled();
      expect(folder.facts.facts.git).toBe("not-a-repository");
      expect(folder.errors).toHaveLength(1);
    });
  });

  describe("runs and changes", () => {
    it("says runs are recorded once the Runs list has one, and tells the rail once", () => {
      const folder = setUp();
      expect(folder.facts.facts.runsRecorded).toBe(false);
      folder.runs.set({ runs: [{}] });
      folder.runs.set({ runs: [{}, {}] });
      expect(folder.facts.facts.runsRecorded).toBe(true);
      expect(folder.told()).toBe(1);
    });

    it("keeps the same facts object while nothing changed", () => {
      const folder = setUp();
      const before = folder.facts.facts;
      folder.runs.set({ runs: [] });
      expect(folder.facts.facts).toBe(before);
    });

    it("stops listening once the rail stops", () => {
      const folder = setUp();
      folder.stop();
      expect(folder.runs.listening).toBe(0);
    });
  });

  it("counts nothing waiting without an Inbox, and gives a workspace project with items", () => {
    const facts = new FolderFactsFromServices(
      { changes: undefined, runs: undefined, inbox: undefined },
      () => undefined,
    );
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
