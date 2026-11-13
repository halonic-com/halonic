/** "1 tool", "2 tools". */
export function toolCount(count: number): string {
  return `${count} ${count === 1 ? "tool" : "tools"}`;
}

/** "stays" for one tool, "stay" for any other count. */
function staysOff(count: number): string {
  return count === 1 ? "stays off" : "stay off";
}

/** The words of the listed-tools review screen (microcopy 27, HAL-751). */
export const listedToolsWords = {
  title: (source: string) => `Review the tools from ${source}`,
  topLine:
    "A server you connected wrote these descriptions. Halonic hasn't checked them. Approve only the tools you expect this server to have.",
  approveSelected: "Approve selected",
  approveAll: "Approve all",
  /** With a search on, the button says how many tools it covers. */
  approveAllShown: (count: number) => `Approve all ${count} shown`,
  approveNone: "Approve none",
  approving: "Approving…",
  allRule:
    "Approve all approves the tools shown here, as shown. Tools that change later ask again.",
  tickSomething: "Tick the tools you want to approve.",
  couldntApprove: (reason: string) => `Couldn't approve the tools: ${reason}.`,
  approved: (count: number, source: string, stayingOff: number) =>
    stayingOff === 0
      ? `Approved ${toolCount(count)} from ${source}`
      : `Approved ${toolCount(count)} from ${source}. ${stayingOff} ${staysOff(stayingOff)}.`,
  approvedNone: (source: string, stayingOff: number) =>
    `Nothing approved. ${toolCount(stayingOff)} from ${source} ${staysOff(stayingOff)}.`,
  removed: (tool: string) =>
    `Removed your approval for ${tool}. It's off until you approve it again.`,
  changedAgain: (tool: string) =>
    `${tool} changed again while you were reviewing. Here is the current version.`,
  nothingWaiting: "Nothing is waiting for your approval.",
  searchLabel: (source: string) => `Search tools from ${source}`,
  searchCount: (shown: number) => `${toolCount(shown)} shown`,
  noMatch: (text: string) => `No tools match "${text}".`,
  clearSearch: "Clear search",
  states: { changed: "Changed", notApproved: "Not approved" },
  tickLabel: (tool: string) => `Approve ${tool}`,
  showAll: "Show all",
  showLess: "Show less",
  argumentsLabel: "Arguments:",
  refusedHeading: "Refused",
  refusedLine:
    "Halonic left these out because they break its rules for tools a server lists. You can't approve them.",
  keepsChangingHeading: "Keeps changing",
  keepsChangingLine: (source: string, tool: string) =>
    `${source} keeps changing ${tool}, so it stays off and isn't asked about.`,
  approveThisVersion: "Approve this version",
  approvedHeading: (count: number) => `Approved (${count})`,
  removeApproval: "Remove approval",
  askedBeforeEachUse: "Asks you before each use.",
  leftOut: (reason: string) => `Halonic left out part of its arguments: ${reason}.`,
  serverChangedOnly: (source: string) =>
    `Its text hasn't changed, but ${source} connects differently than when you approved it: another address, version or settings.`,
  whatChanged: (source: string, changed: number, unapproved: number) => {
    const parts = [
      ...(changed > 0 ? [`changed ${toolCount(changed)}`] : []),
      ...(unapproved > 0 ? [`listed ${unapproved} you haven't approved`] : []),
    ];
    return parts.length === 0 ? "" : `Since you last approved, ${source} ${parts.join(" and ")}.`;
  },
  hidden: {
    lookalike: "Looks the same, but a letter was swapped for one from another alphabet.",
    normalization: "Looks the same, but its characters are written another way.",
    format: "Looks the same, but invisible characters were added or removed.",
    whitespace: "Only spaces or line breaks changed.",
    format: "Looks the same, but it has characters you can't see.",
  },
  approvedVersion: "Approved version",
  newVersion: "New version",
  none: "(none)",
  removedText: "(removed)",
  listingRefused: (source: string, reason: string) =>
    `Couldn't use the tool list from ${source}: ${reason}. None of its listed tools are on.`,
  unreadable: (source: string, tool: string | undefined) =>
    tool === undefined
      ? `Couldn't read an approval for ${source}, so none of its listed tools are on.`
      : `Couldn't read your approval for ${tool}, so none of the tools ${source} lists are on. Remove it, then approve it again.`,
  unreadableUnavailable: "Halonic can't tell which tool it belongs to yet.",
  loadFailed: (reason: string) => `Couldn't list the tools: ${reason}.`,
  tryAgain: "Try again",
  connecting: "Connecting…",
  /** A refused tool's reason is cut to this many characters on screen; the full text is its tooltip. */
  refusedReasonLimit: 64,
  /** More tools than this on the screen turns the search field on. */
  searchThreshold: 10,
} as const;
