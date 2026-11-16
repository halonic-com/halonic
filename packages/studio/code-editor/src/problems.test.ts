// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorProblem } from "./problems.ts";
import { cleanup, createCodeEditorForTest } from "./test-support.ts";

afterEach(cleanup);

const text = "name: A\nmodel: nope\nsteps: 500\nlast: ok";
const nope: EditorProblem = { severity: "error", message: "unknown model", line: 2, col: 8 };
const steps: EditorProblem = { severity: "warning", message: "too many", line: 4, col: 1 };

function cursorLine(editor: { view: import("@codemirror/view").EditorView }): number {
  return editor.view.state.doc.lineAt(editor.view.state.selection.main.head).number;
}

describe("problems in the editor", () => {
  verifies("code-editor.problems", () => {
    it("underlines the word and marks the line in the gutter", () => {
      const editor = createCodeEditorForTest(text);
      editor.setProblems([nope, steps]);

      const underlined = editor.view.dom.querySelector(".cm-problem-error");
      expect(underlined?.textContent).toBe("nope");
      expect(underlined?.getAttribute("title")).toBe("unknown model");
      expect(editor.view.dom.querySelector(".cm-problem-warning")?.textContent).toBe("last:");
      const marks = [...editor.view.dom.querySelectorAll(".cm-problem-mark")];
      expect(marks.map((m) => m.textContent)).toEqual(["✕", "△"]);
      expect(marks.every((m) => m.getAttribute("aria-hidden") === "true")).toBe(true);
      editor.destroy();
    });

    it("shows the error icon on a line with a warning and an error", () => {
      const editor = createCodeEditorForTest(text);
      editor.setProblems([{ severity: "warning", message: "w", line: 2, col: 1 }, nope]);
      expect(
        [...editor.view.dom.querySelectorAll(".cm-problem-mark")].map((m) => m.textContent),
      ).toEqual(["✕"]);
      editor.destroy();
    });

    it("keeps the underline under its word while the user types above it", () => {
      const editor = createCodeEditorForTest(text);
      editor.setProblems([nope]);
      editor.view.dispatch({ changes: { from: 0, insert: "# note\n" } });
      expect(editor.view.dom.querySelector(".cm-problem-error")?.textContent).toBe("nope");
      editor.setProblems([]);
      expect(editor.view.dom.querySelector(".cm-problem-error")).toBeNull();
      expect(editor.view.dom.querySelector(".cm-problem-mark")).toBeNull();
      editor.destroy();
    });

    it("moves to the next and previous problem with F8 and Shift F8, wrapping", () => {
      const onProblemJump = vi.fn();
      const editor = createCodeEditorForTest(text, { onProblemJump });
      editor.setProblems([nope, steps]);
      editor.view.dispatch({ selection: { anchor: 0 } });

      editor.pressKey("F8");
      expect(cursorLine(editor)).toBe(2);
      expect(onProblemJump).toHaveBeenLastCalledWith(nope);
      editor.pressKey("F8");
      expect(cursorLine(editor)).toBe(4);
      editor.pressKey("F8");
      expect(cursorLine(editor)).toBe(2);
      editor.pressKey("F8", { shiftKey: true });
      expect(cursorLine(editor)).toBe(4);
      expect(onProblemJump).toHaveBeenLastCalledWith(steps);
      editor.destroy();
    });

    it("does nothing on F8 when there are no problems", () => {
      const onProblemJump = vi.fn();
      const editor = createCodeEditorForTest(text, { onProblemJump });
      editor.pressKey("F8");
      expect(onProblemJump).not.toHaveBeenCalled();
      editor.destroy();
    });

    it("tells its owner which line's icon was clicked, and ignores a line without one", () => {
      const onProblemMarkClick = vi.fn();
      const editor = createCodeEditorForTest(text, { onProblemMarkClick });
      // jsdom has no layout, so every click lands on line 1.
      const gutter = editor.view.dom.querySelector(".cm-problem-gutter");
      gutter?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(onProblemMarkClick).not.toHaveBeenCalled();

      editor.setProblems([{ ...nope, line: 1, col: 1 }]);
      gutter?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(onProblemMarkClick).toHaveBeenCalledExactlyOnceWith(1);
      editor.destroy();
    });

    it("goes to a line and column, kept inside the text", () => {
      const editor = createCodeEditorForTest(text);
      editor.goTo(3, 5);
      expect(editor.view.state.selection.main.head).toBe(text.indexOf("steps") + 4);
      editor.goTo(99);
      expect(cursorLine(editor)).toBe(4);
      editor.destroy();
    });
  });
});
