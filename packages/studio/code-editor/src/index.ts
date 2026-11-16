import type { CodeEditor, CodeEditorOptions } from "./editor.ts";

export type { CodeEditor, CodeEditorOptions } from "./editor.ts";
export { type EditorLanguage, languageFor } from "./language.ts";

/**
 * Loads the editor and makes one. CodeMirror is a large library, so it is fetched
 * only when a file is first opened and never at start-up (HAL-10536).
 */
export async function openCodeEditor(options: CodeEditorOptions): Promise<CodeEditor> {
  const { createCodeEditor } = await import("./editor.ts");
  return createCodeEditor(options);
}
