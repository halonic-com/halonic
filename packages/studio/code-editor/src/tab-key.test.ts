// @vitest-environment jsdom
import { EditorSelection } from "@codemirror/state";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, createCodeEditorForTest } from "./test-support.ts";

afterEach(cleanup);

describe("tab key", () => {
  verifies("code-editor.tab-key", () => {
    it("inserts spaces, never a tab character", () => {
      const editor = createCodeEditorForTest("");
      editor.pressKey("Tab");
      expect(editor.text()).toBe("  ");
      editor.destroy();
    });

    it("indents every selected line and takes it back with Shift Tab", () => {
      const editor = createCodeEditorForTest("a\nb\nc");
      editor.view.dispatch({ selection: EditorSelection.range(0, 5) });
      editor.pressKey("Tab");
      expect(editor.text()).toBe("  a\n  b\n  c");
      editor.pressKey("Tab", { shiftKey: true });
      expect(editor.text()).toBe("a\nb\nc");
      editor.destroy();
    });

    it("leaves Tab to the browser after Esc", () => {
      const editor = createCodeEditorForTest("");
      editor.pressKey("Escape");
      editor.pressKey("Tab");
      expect(editor.text()).toBe("");
      editor.destroy();
    });

    it("indents again once the user writes after Esc", () => {
      const editor = createCodeEditorForTest("");
      editor.pressKey("Escape");
      editor.type("x");
      editor.pressKey("Tab");
      expect(editor.text()).toBe("x ");
      editor.destroy();
    });

    it("turns Tab moves focus on and off with Ctrl M and tells the owner", () => {
      const onTabFocusChange = vi.fn();
      const editor = createCodeEditorForTest("", { onTabFocusChange });
      editor.pressKey("m", { ctrlKey: true });
      expect(editor.tabMovesFocus()).toBe(true);
      editor.pressKey("Tab");
      expect(editor.text()).toBe("");
      editor.pressKey("m", { ctrlKey: true });
      expect(editor.tabMovesFocus()).toBe(false);
      expect(onTabFocusChange.mock.calls).toEqual([[true], [false]]);
      editor.destroy();
    });
  });
});
