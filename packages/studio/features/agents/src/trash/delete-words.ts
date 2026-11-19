/**
 * The words of an agent's ⋮ menu and of deleting it: no dialog, and Undo, as the Library
 * and Routines do it. There is no trash: saving deletes the file (flow-agents 2.1, microcopy 8.1; UX checklist 9.1 and 9.2).
 */
export const deleteWords = {
  open: "Open",
  openInNewTab: "Open in new tab",
  openAsFile: "Open as file",
  delete: "Delete",
  undo: "Undo",
  tryAgain: "Try again",
  /** The name of a page's ⋮ button. */
  pageMenuLabel: (name: string) => `More actions for ${name}`,
  /** The toast's title; with a second line it is a sentence and ends with a full stop. */
  moved: (name: string, withLine: boolean) => `Deleted ${name}${withLine ? "." : ""}`,
  /** The page strip's text; a sentence when a second line follows. */
  pageMoved: (withLine: boolean) => `This agent was deleted${withLine ? "." : ""}`,
  /**
   * The second line, when workflow steps run the agent: what breaks, and how to fix it (microcopy
   * 8.1). It counts steps, not workflows, and names only the parts that apply (HAL-3276).
   */
  movedLine: (steps: number) =>
    steps === 1
      ? "1 workflow step now shows an error until you pick another agent."
      : `${steps} workflow steps now show an error until you pick another agent.`,
  couldntMove: (name: string, reason: string | undefined) =>
    reason === undefined
      ? `Couldn't delete ${name}.`
      : `Couldn't delete ${name}: ${reason.replace(/\.$/, "")}.`,
  /** The toast when the agent's file path can't be read, so there is nothing to open. */
  couldntOpenFile: (name: string) => `Couldn't open the file of ${name}`,
  couldntUndo: (name: string) => `Couldn't put ${name} back`,
} as const;
