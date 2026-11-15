/** The attribute that marks part of a page as showing the text of workspace files. */
export const workspaceContentAttribute = "data-workspace-content";

/**
 * The props that mark an editor, or the form around its fields, as showing workspace content. In
 * such a field Ctrl Z and Ctrl Shift Z step the workspace's one undo history, so the field's own
 * undo must be off. A field outside it, such as the chat message box, keeps its own undo.
 *
 * @example
 * <div {...workspaceContentProps}><textarea value={instructions} onChange={edit} /></div>
 */
export const workspaceContentProps = { [workspaceContentAttribute]: "" } as const;

/** Whether a key press happened in a field that shows workspace content. */
export function isInWorkspaceContent(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${workspaceContentAttribute}]`) !== null;
}
