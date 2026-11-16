import { EditorView } from "@codemirror/view";
import { type CodeEditor, type CodeEditorOptions, createCodeEditor } from "./editor.ts";

export type { CodeEditor } from "./editor.ts";

const mounted: HTMLElement[] = [];

/** jsdom does no layout, but CodeMirror measures text ranges, so give them empty boxes. */
export function stubLayout(): void {
  const empty = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
  };
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => empty as DOMRect;
}

/** Removes the parents that `createCodeEditorForTest` added to the page. */
export function cleanup(): void {
  for (const parent of mounted.splice(0)) parent.remove();
}

export type TestEditor = CodeEditor & {
  readonly view: EditorView;
  /** Types text at the cursor the way the keyboard does, as one input event. */
  readonly type: (text: string) => void;
  readonly pressKey: (key: string, init?: KeyboardEventInit) => void;
};

/** An editor in the page with a handle to type and press keys; needs `// @vitest-environment jsdom`. */
export function createCodeEditorForTest(
  text: string,
  options: Partial<CodeEditorOptions> = {},
): TestEditor {
  stubLayout();
  const parent = document.createElement("div");
  document.body.append(parent);
  mounted.push(parent);
  const editor = createCodeEditor({
    parent,
    text,
    language: "plain",
    label: "test.txt",
    ...options,
  });
  const view = EditorView.findFromDOM(parent);
  if (!view) throw new Error("the editor did not draw");
  return {
    ...editor,
    view,
    type: (typed) => {
      const at = view.state.selection.main.head;
      view.dispatch({
        changes: { from: at, insert: typed },
        selection: { anchor: at + typed.length },
        userEvent: "input.type",
      });
    },
    pressKey: (key, init) => {
      view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
      );
    },
  };
}
