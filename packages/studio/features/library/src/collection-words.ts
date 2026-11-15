/** The words of the collection page: flow-library 5.3 and microcopy. */
export const collectionWords = {
  kindName: "collection",
  place: "Library",
  loading: "Loading the collection",
  allChip: "All",
  chipsLabel: "Views",
  gridLabel: (name: string) => `${name} records`,
  requiredMark: "*",
  computedMark: "ƒ",
  requiredHint: "required",
  computedHint: "computed",
  volatileLine: "Records are kept only while this Studio is open.",
  usedBy: "Used by",
  notUsed: "No agent uses this collection yet.",
} as const;
