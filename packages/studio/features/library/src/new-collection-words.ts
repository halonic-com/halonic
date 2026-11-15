/** The words of the New collection dialog: flow-library 3.2 and microcopy 11.2. */
export const newCollectionWords = {
  title: "New collection",
  name: "Name",
  nameMissing: "Give it a name.",
  hub: "Hub",
  create: "Create",
  creating: "Creating…",
  retry: "Try again",
  file: (path: string) => `File: ${path}`,
  failed: (reason: string) => `Couldn't create the collection: ${reason}.`,
} as const;
