import type {
  CodeEditor,
  CodeEditorOptions,
  EditorLanguage,
  EditorProblem,
  EditorReviewPart,
} from "@halonicjs/studio-code-editor";

/** One editor the stand-in opened: what it was opened with and what the tab did to it since. */
export interface OpenedEditor {
  options: CodeEditorOptions;
  text: string;
  loads: string[];
  shown: readonly EditorProblem[];
  goneTo: [number, number | undefined][];
  /** The assistant's changes to review last marked, and the parts the bar stepped to. */
  reviewParts: readonly EditorReviewPart[];
  goneToParts: number[];
  focused: number;
  destroyed: boolean;
}

/** Every editor opened since the last {@link forgetOpenedEditors}, oldest first. */
export const openedEditors: OpenedEditor[] = [];

/** Empties {@link openedEditors}; a test file calls it after each test. */
export function forgetOpenedEditors(): void {
  openedEditors.length = 0;
}

/** The stand-in's language: Markdown for a `.md` file, YAML for any other. */
export function languageFor(path: string): EditorLanguage {
  return path.endsWith(".md") ? "markdown" : "yaml";
}

/**
 * A stand-in for the real editor, which is tested in its own package. Every test file that renders
 * a file tab mocks `@halonicjs/studio-code-editor` with this module and reads
 * {@link openedEditors}. Test files share their modules in a worker (`isolate: false`,
 * HAL-15904), so the first file's mock is the one the file tab keeps: one shared stand-in keeps
 * that the same for every file.
 */
export async function openCodeEditor(options: CodeEditorOptions): Promise<CodeEditor> {
  const entry: OpenedEditor = {
    options,
    text: options.text,
    loads: [],
    shown: [],
    goneTo: [],
    reviewParts: [],
    goneToParts: [],
    focused: 0,
    destroyed: false,
  };
  openedEditors.push(entry);
  // Made on the first focus only, so a test that never focuses the editor sees the pane as before.
  let field: HTMLElement | undefined;
  return {
    text: () => entry.text,
    load: (text: string) => {
      entry.text = text;
      entry.loads.push(text);
    },
    setReadOnly: () => {},
    // The focus moves into the pane, as the real editor's does, so a test sees who holds it last.
    focus: () => {
      entry.focused++;
      if (field === undefined) {
        field = options.parent.ownerDocument.createElement("div");
        field.tabIndex = -1;
        field.dataset["editor"] = "";
        options.parent.append(field);
      }
      field.focus();
    },
    setProblems: (problems: readonly EditorProblem[]) => {
      entry.shown = problems;
    },
    goTo: (line: number, column?: number) => {
      entry.goneTo.push([line, column]);
    },
    setReviewParts: (parts: readonly EditorReviewPart[]) => {
      entry.reviewParts = parts;
    },
    goToReviewPart: (index: number) => {
      entry.goneToParts.push(index);
    },
    undo: () => false,
    redo: () => false,
    canUndo: () => false,
    canRedo: () => false,
    tabMovesFocus: () => false,
    destroy: () => {
      field?.remove();
      entry.destroyed = true;
    },
  };
}
