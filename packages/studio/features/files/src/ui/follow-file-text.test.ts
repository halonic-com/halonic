import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { followFileText } from "./follow-file-text.ts";

/** A host whose reads wait until the test answers them, and an editor holding `text`. */
function setup(text: string) {
  const listeners = new Set<() => void>();
  const reads: ((text: string | null) => void)[] = [];
  const host = {
    read: () => new Promise<string | null>((resolve) => reads.push(resolve)),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const editor = {
    shown: text,
    text: () => editor.shown,
    load: (next: string) => (editor.shown = next),
  };
  const edits = { current: 0 };
  const loaded: string[] = [];
  const stop = followFileText({
    host,
    path: "notes.md",
    editor,
    edits,
    loaded: (t) => loaded.push(t),
  });
  const changed = () => {
    for (const listener of listeners) listener();
  };
  /** The person types: the editor holds `next`, one more change. */
  const type = (next: string) => {
    editor.shown = next;
    edits.current += 1;
  };
  // A read answered above runs its callback before this one: callbacks run in order.
  const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));
  return { editor, reads, loaded, stop, changed, type, settle, listeners };
}

verifies("files.ui.file-tab", () => {
  describe("followFileText", () => {
    it("loads a change the editor didn't make", async () => {
      const s = setup("one\n");
      s.changed();
      s.reads[0]?.("two\n");
      await s.settle();
      expect(s.editor.shown).toBe("two\n");
      expect(s.loaded).toEqual(["two\n"]);
    });

    it("drops a read that started before the person typed, so the typing stays", async () => {
      const s = setup("hello\n");
      s.changed();
      s.type("hello!\n");
      s.reads[0]?.("hello\n");
      await s.settle();
      expect(s.editor.shown).toBe("hello!\n");
      expect(s.loaded).toEqual([]);
    });

    it("drops a read that a newer one overtook", async () => {
      const s = setup("one\n");
      s.changed();
      s.changed();
      s.reads[1]?.("three\n");
      await s.settle();
      s.reads[0]?.("two\n");
      await s.settle();
      expect(s.editor.shown).toBe("three\n");
      expect(s.loaded).toEqual(["three\n"]);
    });

    it("loads nothing for the editor's own text, a deleted file, or once stopped", async () => {
      const s = setup("same\n");
      s.changed();
      s.reads[0]?.("same\n");
      s.changed();
      s.reads[1]?.(null);
      s.changed();
      s.stop();
      s.reads[2]?.("later\n");
      await s.settle();
      expect(s.editor.shown).toBe("same\n");
      expect(s.loaded).toEqual([]);
      expect(s.listeners.size).toBe(0);
    });
  });
});
