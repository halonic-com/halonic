import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { filesChangedGapMs, wakeOn } from "./changes-wakes.ts";
import { type GitAnswer, WorkspaceChanges } from "./workspace-changes.ts";
import { choicesMemory } from "./workspace-merge.ts";

const answer = (stdout: string, code = 0, stderr = ""): GitAnswer => ({ code, stdout, stderr });
const notARepository = answer("", 128, "fatal: not a git repository");

/** The focus and changed-files listeners, to wake by hand. */
function sources() {
  const focus = new Set<() => void>();
  const changed = new Set<() => void>();
  const watching = (listeners: Set<() => void>) => (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return { focus, changed, onFocus: watching(focus), onFilesChanged: watching(changed) };
}

function history(git: (args: readonly string[]) => Promise<GitAnswer>) {
  const wakes = sources();
  const files = {
    read: async () => null,
    write: async () => ({ status: "written" as const }),
    remove: async () => ({ status: "removed" as const }),
  };
  const changes = new WorkspaceChanges({
    git,
    files,
    copies: files,
    choices: choicesMemory(undefined, "test"),
    digest: { sha256: async () => new Uint8Array(32) },
    onFocus: wakes.onFocus,
    onFilesChanged: wakes.onFilesChanged,
  });
  return { changes, ...wakes };
}

verifies("source-control.changes-page", () => {
  describe("what wakes the Changes list", () => {
    it("wakes for changed files once at the start of a burst and once at its end, until stopped", () => {
      vi.useFakeTimers();
      try {
        const wakes = sources();
        const listener = vi.fn();
        const stop = wakeOn(wakes, () => true, listener);
        for (let i = 0; i < 20; i++) for (const wake of wakes.changed) wake();
        expect(listener).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(filesChangedGapMs);
        expect(listener).toHaveBeenCalledTimes(2);
        vi.advanceTimersByTime(filesChangedGapMs * 5);
        expect(listener).toHaveBeenCalledTimes(2);
        for (const wake of wakes.changed) wake();
        expect(listener).toHaveBeenCalledTimes(3);
        for (const wake of wakes.changed) wake();
        stop();
        vi.advanceTimersByTime(filesChangedGapMs);
        expect(listener).toHaveBeenCalledTimes(3);
        expect(wakes.focus.size + wakes.changed.size).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("wakes on every focus, without a gap", () => {
      const wakes = sources();
      const listener = vi.fn();
      wakeOn(wakes, () => true, listener);
      for (let i = 0; i < 3; i++) for (const wake of wakes.focus) wake();
      expect(listener).toHaveBeenCalledTimes(3);
    });

    it("doesn't read a folder that isn't a repository again for changed files, only on focus", async () => {
      const { changes, focus, changed } = history(async () => notARepository);
      const listener = vi.fn();
      changes.subscribe(listener);
      expect(await changes.read()).toEqual({ kind: "not-a-repository" });
      for (const wake of changed) wake();
      expect(listener).not.toHaveBeenCalled();
      for (const wake of focus) wake();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("reads again for changed files once a read finds a repository", async () => {
      let repository = false;
      const { changes, changed } = history(async (args) => {
        if (args[0] !== "rev-parse") return answer("");
        return repository ? answer("true\n") : notARepository;
      });
      const listener = vi.fn();
      changes.subscribe(listener);
      await changes.read();
      repository = true;
      expect(await changes.read()).toEqual({ kind: "ready", changes: [] });
      for (const wake of changed) wake();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
