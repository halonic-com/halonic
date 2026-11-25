// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorReviewActions } from "./review-parts.ts";
import { cleanup, createCodeEditorForTest, type TestEditor } from "./test-support.ts";

afterEach(cleanup);

const text = "name: Triage\nmodel: large\nsteps: 5\nlast: ok";

function editorWith(onDecide: EditorReviewActions["onDecide"] = () => {}): TestEditor {
  return createCodeEditorForTest(text, {
    review: {
      accept: "Accept",
      reject: "Reject",
      rejectAndDelete: "Reject and delete file",
      partLabel: (at, count, { line, added, removed }) =>
        `Change ${at} of ${count}: ${added} added, ${removed} removed at line ${line}`,
      onDecide,
    },
  });
}

function markedLines(editor: TestEditor): string[] {
  return [...editor.view.dom.querySelectorAll(".cm-line.cm-review-added")].map(
    (line) => line.textContent ?? "",
  );
}

/** Every CSS rule the editor's theme put in the page, as text. */
function pageCss(): string {
  return [...document.querySelectorAll("style")].map((style) => style.textContent).join("\n");
}

function groups(editor: TestEditor): HTMLElement[] {
  return [...editor.view.dom.querySelectorAll<HTMLElement>(".cm-review-part")];
}

describe("the assistant's changes to review in the editor", () => {
  verifies("code-editor.review-parts", () => {
    it("marks the added lines green and shows the removed ones struck through above", () => {
      const editor = editorWith();
      editor.setReviewParts([{ line: 2, added: 1, removed: ["model: small"] }]);

      expect(markedLines(editor)).toEqual(["model: large"]);
      const [group] = groups(editor);
      expect(group?.getAttribute("role")).toBe("group");
      expect(group?.getAttribute("aria-label")).toBe("Change 1 of 1: 1 added, 1 removed at line 2");
      expect(group?.querySelector("del")?.textContent).toBe("model: small");
      expect([...(group?.querySelectorAll("button") ?? [])].map((b) => b.textContent)).toEqual([
        "Accept",
        "Reject",
      ]);
      editor.destroy();
    });

    it("says Reject and delete file on the only part of a file the assistant created", () => {
      const editor = editorWith();
      editor.setReviewParts([{ line: 1, added: 4, removed: [], deletesFile: true }]);
      expect(groups(editor)[0]?.querySelectorAll("button")[1]?.textContent).toBe(
        "Reject and delete file",
      );
      editor.destroy();
    });

    it("tells the owner which part and which decision", () => {
      const onDecide = vi.fn();
      const editor = editorWith(onDecide);
      editor.setReviewParts([
        { line: 1, added: 1, removed: [] },
        { line: 3, added: 2, removed: [] },
      ]);

      expect(markedLines(editor)).toEqual(["name: Triage", "steps: 5", "last: ok"]);
      groups(editor)[1]?.querySelectorAll("button")[1]?.click();
      expect(onDecide).toHaveBeenCalledWith(1, "reject");
      editor.destroy();
    });

    it("keeps the mark on its text while the user types above it, and clears it on request", () => {
      const editor = editorWith();
      editor.setReviewParts([{ line: 3, added: 1, removed: [] }]);
      editor.view.dispatch({ changes: { from: 0, insert: "# note\n" } });
      expect(markedLines(editor)).toEqual(["steps: 5"]);

      editor.setReviewParts([]);
      expect(markedLines(editor)).toEqual([]);
      expect(groups(editor)).toEqual([]);
      editor.destroy();
    });

    it("doesn't mark a line the user types at the very start of a part", () => {
      const editor = editorWith();
      editor.setReviewParts([{ line: 1, added: 2, removed: [] }]);
      editor.view.dispatch({ changes: { from: 0, insert: "# note\n" } });
      expect(markedLines(editor)).toEqual(["name: Triage", "model: large"]);

      editor.view.dispatch({ changes: { from: 0, insert: "x" } });
      expect(markedLines(editor)).toEqual(["name: Triage", "model: large"]);
      editor.destroy();
    });

    it("shows lines removed at the end after the text", () => {
      const editor = editorWith();
      editor.setReviewParts([{ line: 5, added: 0, removed: ["extra: yes"] }]);
      const [group] = groups(editor);
      expect(group?.querySelector("del")?.textContent).toBe("extra: yes");
      expect(group?.previousElementSibling?.textContent).toBe("last: ok");
      editor.destroy();
    });

    it("edges the changed lines and draws the buttons as the kit's sm Button", () => {
      const editor = editorWith();
      const css = pageCss();
      expect(css).toMatch(
        /\.cm-review-added\s*\{[^}]*border-inline-start:\s*2px solid var\(--color-success\)/,
      );
      expect(css).toMatch(
        /\.cm-review-removed\s*\{[^}]*border-inline-start:\s*2px solid var\(--color-danger\)/,
      );
      expect(css).toMatch(/\.cm-review-button\s*\{[^}]*min-height:\s*var\(--spacing-control-sm\)/);
      expect(css).toMatch(
        /\.cm-review-button:focus-visible\s*\{[^}]*box-shadow:\s*var\(--focus-ring\)/,
      );
      editor.destroy();
    });

    it("goes to a part's first line and takes focus", () => {
      const editor = editorWith();
      editor.setReviewParts([
        { line: 1, added: 1, removed: [] },
        { line: 3, added: 1, removed: [] },
      ]);
      editor.goToReviewPart(1);
      const { state } = editor.view;
      expect(state.doc.lineAt(state.selection.main.head).number).toBe(3);
      expect(editor.view.dom.contains(document.activeElement)).toBe(true);
      editor.destroy();
    });
  });

  verifies("code-editor.review-part-focus", () => {
    it("moves the focus to the named group of the part it goes to", () => {
      const editor = editorWith();
      editor.setReviewParts([
        { line: 1, added: 1, removed: [] },
        { line: 3, added: 1, removed: [] },
      ]);
      editor.goToReviewPart(1);
      expect(document.activeElement).toBe(groups(editor)[1]);
      expect(document.activeElement?.getAttribute("aria-label")).toBe(
        "Change 2 of 2: 1 added, 0 removed at line 3",
      );
      editor.destroy();
    });
  });
});
