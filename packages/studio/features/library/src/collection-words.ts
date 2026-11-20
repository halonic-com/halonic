/** The words of the collection page: flow-library 5.3 and microcopy. */
export const collectionWords = {
  kindName: "collection",
  place: "Library",
  loading: (name: string) => `Loading ${name}`,
  couldntLoad: "Couldn't load this collection",
  tryAgain: "Try again",
  renameFailed: "Couldn't rename the collection.",
  allChip: "All",
  chipsLabel: "Views",
  gridLabel: (name: string) => `${name} records`,
  requiredMark: "*",
  computedMark: "ƒ",
  requiredHint: "required",
  computedHint: "computed",
  yes: "yes",
  no: "no",
  volatileLine: "Records are kept only while this Studio is open.",
  defaultTag: "default",
  newRowLabel: "New record",
  nameLabel: "Name",
  newRowHint: (needed: readonly string[]) =>
    `Fill the last row to add a record: still needed ${needed.join(", ")}.`,
  rowRemoved: "Row removed by another change.",
  saveFailed: "Couldn't save the change.",
  addFailed: "Couldn't add the record.",
  // A record is named by its first field's text; one whose first field is empty, by these fallbacks.
  rowMenuLabel: (record: string | undefined) => `More actions for ${record ?? "this record"}`,
  cellLabel: (field: string, record: string | undefined) =>
    record === undefined ? field : `${field}, ${record}`,
  remove: "Remove",
  removing: "Removing…",
  removeTitle: (record: string | undefined) => `Remove ${record ?? "this record"}?`,
  removeFailed: "Couldn't remove the record.",
  added: (record: string | undefined) =>
    record === undefined ? "Added a record." : `Added ${record}.`,
  removed: (record: string | undefined) =>
    record === undefined ? "Removed a record." : `Removed ${record}.`,
  noRecords: "No records yet.",
  addRecord: "Add record",
  noneInView: "No records match this view.",
  notUsed: "No agent uses this collection yet.",
} as const;
