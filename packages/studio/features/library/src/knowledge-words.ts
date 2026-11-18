/** The words of the knowledge page: flow-library 5.2 and microcopy. */
export const knowledgeWords = {
  kindName: "knowledge source",
  place: "Library",
  source: "Source",
  writableNote: "Agents can keep notes here.",
  summary: "Summary",
  noSummary: "No summary yet.",
  summarize: "Summarize",
  summarizing: "Summarizing…",
  draft: "Draft summary",
  draftReady: "Draft summary ready. Use this summary or Discard.",
  useDraft: "Use this summary",
  discard: "Discard",
  needsLocalModel: "Summarize uses a local model, and the default model alias has none.",
  models: "Models ›",
  noDocuments: (name: string) =>
    `${name} has no documents to summarize, or Halonic can't list them.`,
  summarizeFailed: (name: string, reason: string) => `Couldn't summarize ${name}: ${reason}.`,
  modelFailed: "the local model didn't answer",
  /** After "Couldn't summarize *name*:" in lower case, from the host's own "isn't answering" words (microcopy 1.2). */
  hostUnreachable: (notAnswering: string) =>
    notAnswering.replace(/\.$/, "").replace(/^The /, "the "),
  tooLarge: "it has more text than one summary can take",
  tryAgain: "Try again",
  removeSummary: "Remove summary",
  lookup: "How agents look things up",
  lookupTools: "Agents search when they decide to (tools)",
  lookupAuto: "Also search with the task before the first model call (auto)",
  notUsed: "No agent uses this source yet.",
  loading: (name: string) => `Loading ${name}`,
  couldntLoad: (name: string) => `Couldn't load ${name}`,
  unreadable: "This source's file can't be read here. Open it as a file to fix it.",
} as const;
