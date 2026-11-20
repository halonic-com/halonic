import type { RefusalLinePart } from "./refusal-line.ts";

/** "1 tool", "2 tools". */
export function toolCount(count: number): string {
  return `${count} ${count === 1 ? "tool" : "tools"}`;
}

/** "stays" for one tool, "stay" for any other count. */
function staysOff(count: number): string {
  return count === 1 ? "stays off" : "stay off";
}

/** "A or B", "A, B or C". */
function oneOf(names: readonly string[]): string {
  const last = names.at(-1) ?? "";
  return names.length < 2 ? last : `${names.slice(0, -1).join(", ")} or ${last}`;
}

/** The words of the listed-tools review screen (microcopy 27, HAL-751). */
export const listedToolsWords = {
  title: (source: string) => `Review the tools from ${source}`,
  topLine:
    "A server you connected wrote these descriptions. Halonic hasn't checked them. Approve only the tools you expect this server to have.",
  approveSelected: "Approve selected",
  approveAll: (count: number) => `Approve all (${count})`,
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
  couldntRemove: (tool: string, reason: string) =>
    `Couldn't remove your approval for ${tool}: ${reason}.`,
  close: "Close",
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
  /** What a changed text is called: the same words as `halonic tools review`. */
  changedName: "Name",
  changedDescription: "Description",
  changedRequired: "Required arguments",
  changedArgument: (argument: string, field: string) => `Argument ${argument}: ${field}`,
  changedOther: (path: string) => `Arguments: ${path}`,
  refusedHeading: "Halonic won't use these",
  refusedLine: "These tools break Halonic's rules for tools. You can't approve them.",
  keepsChangingHeading: "Keeps changing",
  keepsChangingLine: (tool: string) => `This server keeps changing ${tool}. It stays off.`,
  turnOnAnyway: "Turn it on anyway",
  approvedHeading: (count: number) => `Approved (${count})`,
  removeApproval: "Remove approval",
  askedBeforeEachUse: "Asks you before each use.",
  /** Instead of {@link askedBeforeEachUse}, when the connector's `read` list marks the tool. */
  doesntAsk: (workspace: string) =>
    `Doesn't ask before each use: ${workspace} marks it as read-only.`,
  /** The line under a tool the person approved. Never "safe" or "trusted": approving doesn't vouch for the tool. */
  approvedAsks: "Approved. It still asks before each use.",
  /** The button next to the waiting line on the connector's page; it opens the review. */
  reviewTools: "Review tools",
  /** Instead of **Review tools** on a phone: approving tools is for the computer running Halonic. */
  reviewToolsViewOnly: "View only here. Review the tools on the computer running Halonic.",
  /** The line on the connector's page, above **Review tools**. */
  waitingBadge: (count: number) =>
    count === 1
      ? "1 tool is waiting for your approval"
      : `${count} tools are waiting for your approval`,
  /** The line on the connector's page when the review can't open its rows: **Review tools** or **Try again** follows it. */
  waitingNotice: {
    listingRefused: "Couldn't use this server's tool list, so none of its listed tools are on.",
    unreadable: "Couldn't read an approval, so none of this server's listed tools are on.",
  },
  leftOut: (reason: string) => `Halonic left out part of its arguments: ${reason}.`,
  serverChangedOnly: (source: string) =>
    `Its text hasn't changed, but ${source} connects differently than when you approved it: another address, version or settings.`,
  hidden: {
    lookalike: "Looks the same, but a letter was swapped for one from another alphabet.",
    normalization: "Looks the same, but its characters are written another way.",
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
  /** The line when the agent host says why the connector's program couldn't list its tools (UX check C2). */
  couldntList: {
    programMissing: (source: string, program: string): readonly RefusalLinePart[] => [
      { text: `Couldn't list the tools: ${source} needs the program ` },
      { text: program, code: true },
      { text: ", which isn't on this computer. Install it, then try again." },
    ],
    /** A command box with {@link listedToolsWords.setSecret} follows it. */
    secretMissing: (source: string, secret: string) =>
      `Couldn't list the tools: ${source} needs the secret ${secret}, which isn't set on this computer. Set it in a terminal, then try again:`,
    /** A command box with {@link listedToolsWords.setSecret} follows it. */
    secretRefused: (source: string, secret: string) =>
      `Couldn't list the tools: ${source} didn't accept the secret ${secret}. Set it again in a terminal, then try again:`,
    /** When the connector declares more than one secret, so Halonic can't tell which one was refused. */
    secretRefusedOneOf: (
      source: string,
      secrets: readonly string[],
    ): readonly RefusalLinePart[] => [
      {
        text: `Couldn't list the tools: ${source} didn't accept one of its secrets, ${oneOf(secrets)}. Set the right one again in a terminal with `,
      },
      { text: "halonic secret set", code: true },
      { text: ", then try again." },
    ],
    /** When the server asks for a secret the connector doesn't declare: setting one can't help. */
    secretRefusedNoneSent: (source: string) =>
      `Couldn't list the tools: the server for ${source} asked for a secret, and ${source} doesn't send one.`,
    stopped: (source: string) => `Couldn't list the tools: ${source} stopped before it answered.`,
  },
  setSecret: (secret: string) => `halonic secret set ${secret}`,
  tryAgain: "Try again",
  /** Opens the workspace's trust check, when the tools couldn't be listed because it isn't trusted. */
  reviewTrust: "Review",
  connecting: "Connecting…",
  /** More tools than this on the screen turns the search field on. */
  searchThreshold: 10,
} as const;
