import { ShellError } from "./shell-error.ts";

/**
 * A view the shell loads only when it's shown: the name of a named export
 * and a function that imports its module. Loading by name keeps the
 * "named exports only" rule for views too.
 *
 * @example
 * const editor: ViewRef = { view: "AgentEditorView", load: () => import("./editor/ui/agent-editor-view.tsx") };
 */
export interface ViewRef {
  /** The named export to take from the module. */
  readonly view: string;
  /** Imports the module, usually `() => import("./…")`. */
  readonly load: () => Promise<object>;
}

/**
 * Imports a view's module and returns its named export.
 *
 * @throws ShellError when the module has no export with that name
 */
export async function loadView<View = unknown>(ref: ViewRef): Promise<View> {
  const module = (await ref.load()) as Record<string, unknown>;
  if (!(ref.view in module) || module[ref.view] === undefined) {
    const exported = Object.keys(module).join(", ") || "nothing";
    throw new ShellError(
      `The view "${ref.view}" is not exported by its module (it exports ${exported}). Check the name, and that the view is a named export.`,
    );
  }
  return module[ref.view] as View;
}
