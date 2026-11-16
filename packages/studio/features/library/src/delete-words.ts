/** The words of deleting a Library item (flow-library 4): no dialog, the trash and Undo. */
export const deleteWords = {
  delete: "Delete",
  undo: "Undo",
  pageMenuLabel: (name: string) => `More actions for ${name}`,
  /** The toast's title and the page strip's text. */
  moved: (name: string) => `Moved ${name} to the trash`,
  /** The toast when the item couldn't be moved; `reason` is a kinded error's sentence. */
  couldntDelete: (name: string) => `Couldn't delete ${name}`,
  couldntUndo: (name: string) => `Couldn't put ${name} back`,
  restored: (name: string) => `Put ${name} back`,
} as const;
