import type { WorkflowUsers } from "../api.ts";

/** The words of the workflow page's ⋮ and of its Delete (microcopy 9.1 Delete, UX checklist 10.2). */
export const deleteWords = {
  /** The name of the page's ⋮ button. */
  menuLabel: (name: string) => `More actions for ${name}`,
  delete: "Delete",
  undo: "Undo",
  tryAgain: "Try again",
  /** The strip that stands in the page after Delete; a sentence when a second line follows. */
  deleted: (withLine: boolean) => `This workflow was deleted${withLine ? "." : ""}`,
  /**
   * The second line, when routines or other workflows' steps run the workflow: one sentence that
   * says what breaks and how to fix it, naming only the parts that apply (microcopy 8.1, HAL-3276).
   */
  usersLine: ({ routines, steps }: WorkflowUsers): string | undefined => {
    const parts = [
      ...(routines === 0 ? [] : [routines === 1 ? "1 routine" : `${routines} routines`]),
      ...(steps === 0 ? [] : [steps === 1 ? "1 workflow step" : `${steps} workflow steps`]),
    ];
    if (parts.length === 0) return undefined;
    const one = routines + steps === 1;
    return `${parts.join(" and ")} now ${one ? "shows" : "show"} an error until you pick another workflow.`;
  },
  couldntDelete: (name: string, reason: string) =>
    `Couldn't delete ${name}: ${reason.replace(/\.$/, "")}.`,
  couldntPutBack: (name: string) => `Couldn't put ${name} back`,
} as const;
