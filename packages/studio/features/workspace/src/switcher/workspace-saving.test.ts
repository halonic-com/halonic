import { ChangedOnDiskError } from "@halonicjs/app";
import { createToastStore } from "@halonicjs/studio-kit";
import { SaveState } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_DELAY_MS, historyKey, WorkspaceSaving } from "./workspace-saving.ts";

/** A workspace's files that count what happens to them and can fail to save. */
function fakeFiles() {
  const listeners = new Set<() => void>();
  const files = {
    dirty: false,
    saves: 0,
    undos: 0,
    redos: 0,
    failWith: undefined as Error | undefined,
    save: async () => {
      files.saves += 1;
      if (files.failWith !== undefined) throw files.failWith;
      files.dirty = false;
    },
    undo: () => {
      files.undos += 1;
    },
    redo: () => {
      files.redos += 1;
    },
    change: () => {
      files.dirty = true;
      files.notify();
    },
    notify: () => {
      for (const listener of listeners) listener();
    },
  };
  return {
    files,
    onChange: (listener: () => void) => (listeners.add(listener), () => listeners.delete(listener)),
  };
}

function setup() {
  const toasts = createToastStore();
  const saving = new SaveState(toasts);
  const { files, onChange } = fakeFiles();
  const workspace = new WorkspaceSaving({ files, onChange, saving, name: "Acme" });
  return { files, saving, toasts, workspace };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

verifies("workspace.saves-itself", () => {
  describe("WorkspaceSaving", () => {
    it("saves once, a pause after the last change", async () => {
      const { files } = setup();
      files.change();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100);
      files.change();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100);
      expect(files.saves).toBe(0);
      await vi.advanceTimersByTimeAsync(100);
      expect(files.saves).toBe(1);
    });

    it("doesn't save when a change was undone to nothing", async () => {
      const { files } = setup();
      files.change();
      files.dirty = false;
      files.notify();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
      expect(files.saves).toBe(0);
    });

    it("saves now without the pause and says whether all is saved", async () => {
      const { files, workspace } = setup();
      files.change();
      expect(await workspace.saveNow()).toBe(true);
      expect(files.saves).toBe(1);
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
      expect(files.saves).toBe(1);
    });

    it("has nothing to do when nothing is unsaved", async () => {
      const { files, workspace } = setup();
      expect(await workspace.saveNow()).toBe(true);
      expect(files.saves).toBe(0);
    });

    it("keeps why a save failed, shows its toast, and forgets it when a save works", async () => {
      const { files, toasts, workspace } = setup();
      files.change();
      files.failWith = Object.assign(new Error("no space"), { code: "ENOSPC" });
      expect(await workspace.saveNow()).toBe(false);
      expect(workspace.problem).toEqual({ reason: "disk-full" });
      expect(toasts.list().map((toast) => toast.title)).toEqual([
        "Couldn't save Acme: the disk is full.",
      ]);

      files.failWith = undefined;
      expect(await workspace.saveNow()).toBe(true);
      expect(workspace.problem).toBeUndefined();
    });

    it("undoes and redoes through the files", () => {
      const { files, workspace } = setup();
      workspace.undo();
      workspace.redo();
      expect([files.undos, files.redos]).toEqual([1, 1]);
    });

    it("doesn't start a second save while one is still writing", async () => {
      const { files, workspace } = setup();
      let finish = () => {};
      files.save = async () => {
        files.saves += 1;
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        files.dirty = false;
      };
      files.change();
      const first = workspace.saveNow();
      const second = workspace.saveNow();
      await vi.advanceTimersByTimeAsync(0);
      expect(files.saves).toBe(1);
      finish();
      expect(await Promise.all([first, second])).toEqual([true, true]);
      expect(files.saves).toBe(1);
    });

    it("stops saving once disposed", async () => {
      const { files, workspace } = setup();
      files.change();
      workspace.dispose();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
      expect(files.saves).toBe(0);
    });
  });

  describe("historyKey", () => {
    const press = (init: Partial<KeyboardEvent>) => ({
      key: "z",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      ...init,
    });

    it("reads Ctrl Z as undo and Ctrl Shift Z as redo, or ⌘ on macOS", () => {
      expect(historyKey(press({ ctrlKey: true }), "windows")).toBe("undo");
      expect(historyKey(press({ key: "Z", ctrlKey: true, shiftKey: true }), "linux")).toBe("redo");
      expect(historyKey(press({ metaKey: true }), "macos")).toBe("undo");
    });

    it("leaves other keys, Alt and the other platform's key alone", () => {
      expect(historyKey(press({}), "windows")).toBeUndefined();
      expect(historyKey(press({ key: "y", ctrlKey: true }), "windows")).toBeUndefined();
      expect(historyKey(press({ ctrlKey: true, altKey: true }), "windows")).toBeUndefined();
      expect(historyKey(press({ ctrlKey: true }), "macos")).toBeUndefined();
    });
  });
});

verifies("workspace.save-holds-changed-files", () => {
  describe("WorkspaceSaving with a file changed outside Halonic", () => {
    it("tells the host which files were held and shows no failure", async () => {
      const { files, onChange } = fakeFiles();
      const toasts = createToastStore();
      const saving = new SaveState(toasts);
      const heard: string[][] = [];
      const workspace = new WorkspaceSaving({
        files,
        onChange,
        saving,
        name: "Acme",
        onHeld: (held) => heard.push(held.map(({ path }) => path)),
      });
      files.failWith = new ChangedOnDiskError("a.md", "theirs");
      files.change();

      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

      expect(heard).toEqual([["a.md"]]);
      expect(toasts.list()).toEqual([]);
      expect(saving.note).toEqual({ kind: "saved" });
      expect(workspace.problem).toBeUndefined();
    });

    it("still reports failures of other kinds", async () => {
      const { files, saving, toasts } = setup();
      files.failWith = new Error("disk is gone");
      files.change();

      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

      expect(saving.note.kind).toBe("failed");
      expect(toasts.list()).toHaveLength(1);
    });
  });
});
