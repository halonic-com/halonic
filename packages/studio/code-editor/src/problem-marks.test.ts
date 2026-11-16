// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, createCodeEditorForTest, stubLayout } from "./test-support.ts";

beforeAll(stubLayout);
afterEach(cleanup);

const text = "name: A\nmodel: nope\nmaxSteps: 500\n";

describe("problem marks", () => {
  verifies("code-editor.problem-marks", () => {
    it("underlines the word at a problem and marks its line with a ✕", () => {
      const editor = createCodeEditorForTest(text);
      editor.setProblems([{ severity: "error", message: "unknown model", line: 2, col: 8 }]);
      const underlined = editor.view.dom.querySelectorAll(".cm-squiggle-error");
      expect([...underlined].map((node) => node.textContent)).toEqual(["nope"]);
      const icons = editor.view.dom.querySelectorAll(".cm-problem-icon");
      expect([...icons].map((node) => node.textContent)).toEqual(["✕"]);
      editor.destroy();
    });

    it("shows a △ for a warning and the ✕ when a line has both", () => {
      const editor = createCodeEditorForTest(text);
      editor.setProblems([
        { severity: "warning", message: "careful", line: 1, col: 1 },
        { severity: "warning", message: "careful", line: 2, col: 1 },
        { severity: "error", message: "wrong", line: 2, col: 8 },
      ]);
      const icons = editor.view.dom.querySelectorAll(".cm-problem-icon");
      expect([...icons].map((node) => node.textContent)).toEqual(["△", "✕"]);
      editor.destroy();
    });

    it("clears every mark when the problems are none", () => {
      const editor = createCodeEditorForTest(text);
      editor.setProblems([{ severity: "error", message: "wrong", line: 1, col: 1 }]);
      editor.setProblems([]);
      expect(editor.view.dom.querySelector(".cm-squiggle")).toBeNull();
      expect(editor.view.dom.querySelector(".cm-problem-icon")).toBeNull();
      editor.destroy();
    });

    it("tells its owner the line when a mark is clicked, and ignores a line with none", () => {
      const clicked = vi.fn();
      const editor = createCodeEditorForTest(text, { onProblemClick: clicked });
      // jsdom does no layout, so every click lands on line 1.
      const gutterElement = () =>
        editor.view.dom.querySelector(".cm-problem-gutter .cm-gutterElement");
      editor.setProblems([{ severity: "error", message: "wrong", line: 3, col: 1 }]);
      gutterElement()?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(clicked).not.toHaveBeenCalled();
      editor.setProblems([{ severity: "error", message: "wrong", line: 1, col: 1 }]);
      gutterElement()?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(clicked).toHaveBeenCalledWith(1);
      editor.destroy();
    });

    it("moves the cursor to a line and column, and to the last line when it is past the end", () => {
      const editor = createCodeEditorForTest(text);
      editor.goTo(2, 8);
      expect(editor.view.state.selection.main.head).toBe(text.indexOf("nope"));
      editor.goTo(99, 1);
      expect(editor.view.state.doc.lineAt(editor.view.state.selection.main.head).number).toBe(4);
      editor.destroy();
    });

    it("tells its owner about F8 and Shift F8", () => {
      const pressed = vi.fn();
      const editor = createCodeEditorForTest(text, { onProblemKey: pressed });
      editor.pressKey("F8");
      editor.pressKey("F8", { shiftKey: true });
      expect(pressed.mock.calls).toEqual([[1], [-1]]);
      editor.destroy();
    });
  });
});
