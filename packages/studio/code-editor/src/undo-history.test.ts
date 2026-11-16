// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, createCodeEditorForTest, type TestEditor } from "./test-support.ts";

describe("undo history", () => {
  let editor: TestEditor;
  beforeEach(() => {
    vi.useFakeTimers();
    editor = createCodeEditorForTest("");
  });
  afterEach(() => {
    editor.destroy();
    cleanup();
    vi.useRealTimers();
  });

  verifies("code-editor.undo-history", () => {
    it("joins typing within half a second into one step", () => {
      editor.type("a");
      vi.advanceTimersByTime(100);
      editor.type("b");
      expect(editor.text()).toBe("ab");
      editor.undo();
      expect(editor.text()).toBe("");
    });

    it("keeps typing after a pause as a separate step", () => {
      editor.type("a");
      vi.advanceTimersByTime(600);
      editor.type("b");
      editor.undo();
      expect(editor.text()).toBe("a");
    });

    it("does an undone edit again", () => {
      editor.type("a");
      editor.undo();
      expect(editor.redo()).toBe(true);
      expect(editor.text()).toBe("a");
    });

    it("forgets the redo steps after a new edit", () => {
      editor.type("a");
      editor.undo();
      vi.advanceTimersByTime(600);
      editor.type("c");
      expect(editor.canRedo()).toBe(false);
    });

    it("has nothing to undo after another text is loaded", () => {
      editor.type("a");
      editor.load("other");
      expect(editor.canUndo()).toBe(false);
      expect(editor.undo()).toBe(false);
    });
  });
});
