// The words of a plugin's trust check, from the plugin screens design section 5, microcopy 24
// T6 to T10 and the UX acceptance checklist 4 (HAL-1739, HAL-751, HAL-1952). The plugin's name,
// version, tool names and addresses are only ever a value in these lines.

import { hostFromSetting } from "../settings/settings-text.ts";

/** Why the trust check opens: right after Add, or from **Review** on the plugin's page. */
export type TrustCheckReason = "add" | "review";

/** The dialog's title (T6). */
export function trustTitle(reason: TrustCheckReason, name: string): string {
  return reason === "add" ? `Trust ${name} and turn it on?` : `Trust ${name}?`;
}

/** The source line's start: "Plugin · version 1.2.0"; " · from *source*" follows (design section 5). */
export function sourceLead(version: string): string {
  return `Plugin · version ${version}`;
}

/** Between the source line's parts. */
export const FROM = " · from ";
export const AT = " at ";

/** The primary while trust is being saved (kit busy rule, a11y A1). */
export const TRUSTING = "Trusting…";

/**
 * Why trust wasn't saved, in the dialog's error slot (checklist 15, G2): the workspace check's
 * words (microcopy 4.3).
 */
export function trustNotSavedLine(reason: string): string {
  return `Couldn't save trust: ${afterColon(reason)}. Nothing was started.`;
}

/**
 * A host's message after a colon: no closing full stop, and a capital that only starts the
 * sentence lower-cased ("The disk is full." is "the disk is full"), so a name such as "Windows"
 * keeps its capital.
 */
function afterColon(reason: string): string {
  const trimmed = reason.trim().replace(/\.$/, "");
  return /^\p{Lu}\p{Ll}/u.test(trimmed) && !/^\S+\p{Lu}/u.test(trimmed)
    ? trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
    : trimmed;
}

/** The focused button that leaves the plugin off (T10). */
export const NOT_NOW = "Not now";

/**
 * The button that trusts (T10). From **Review** it's "Trust", as the workspace check's Review
 * says it: the button word isn't drawn (checklist 15, G1).
 */
export function trustButton(reason: TrustCheckReason): string {
  return reason === "add" ? "Trust and turn on" : "Trust";
}

/**
 * The trust check's last line, outside the scroll area (T9, CHECK P1). The one place it's
 * written, so HAL-3384 can put the approved "Runs" line (microcopy 24.1) here without touching
 * the dialog.
 */
export const TRUST_CHECK_LAST_LINE =
  "Plugin code runs apart from Studio. Halonic doesn't check what the plugin does with what it's given.";

/** The section titles, in the order the dialog shows them (T7). */
export const TOOLS_SECTION = "Tools for agents";
export const PROGRAMS_SECTION = "Programs on this computer";
export const SECRETS_SECTION = "Secrets";
export const ADDRESSES_SECTION = "Addresses";
export const IN_STUDIO_SECTION = "In Studio";

/** A section's row: its title and how many things it holds, "Tools for agents (2)". */
export function sectionRow(title: string, count: number): string {
  return `${title} (${count})`;
}

/** The first line in Tools for agents (T8). */
export const TOOLS_INTRO =
  "Agents can use these through a connector. Each one asks a person first unless you change that.";

/** After a tool whose answers the plugin marks as untrusted (T8). */
export const OUTSIDE_TEXT = "its answers are treated as outside text";

/** The labels of an open program (design section 5). A label shows only when it has a value. */
export const RUNS = "Runs";
export const VERSION = "Version";
export const CAN_REACH = "Can reach";

/** Where a program runs (T8). HAL-3384 makes it depend on whether the sandbox works. */
export const RUNS_IN_SANDBOX = "In the agent sandbox, in its own empty folder";

/** The labels of a secret (design section 5). */
export const GOES_ONLY_TO = "Goes only to";
export const HOW = "How";

/** Under each secret (T8). */
export function secretValueLine(name: string): string {
  return `You enter its value in ${name}'s settings. The plugin's code never sees it.`;
}

/** After an address that only a program reaches (design section 5). */
export const THE_PROGRAM = "(the program)";

/** The first line in In Studio (T8). */
export const IN_STUDIO_LINE =
  "Halonic draws these itself. Text from the plugin is shown as plain text.";

// British English: no comma before "and", as in every Halonic text.
const list = new Intl.ListFormat("en-GB", { type: "conjunction" });

/** "1 tool", "2 tools": a count and its noun. */
export function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** What In Studio's row says: "Settings, 1 command, 1 card and a panel". */
export function inStudioRow(parts: {
  readonly settings: boolean;
  readonly commands: number;
  readonly cards: number;
  readonly panel: boolean;
}): string {
  const named = [
    parts.settings ? "settings" : undefined,
    parts.commands === 0 ? undefined : counted(parts.commands, "command", "commands"),
    parts.cards === 0 ? undefined : counted(parts.cards, "card", "cards"),
    parts.panel ? "a panel" : undefined,
  ].filter((part) => part !== undefined);
  return capitalised(list.format(named));
}

/** How many of each thing the plugin adds, for the summary. */
export interface TrustCounts {
  readonly tools: number;
  /** Tools that change things. */
  readonly writes: number;
  /** Tools that send. */
  readonly sends: number;
  readonly programs: number;
  readonly secrets: number;
  /** Where its secrets go, when they all go to the one address. */
  readonly secretsTo: string | undefined;
  readonly addresses: number;
}

/**
 * The summary, in risk order, zero counts left out (design section 5, checklist 4.1): "Adds 2
 * tools for agents, 1 of which changes things. Starts 1 program on this computer, sends 1 secret
 * to api.example.com and reaches 2 addresses." `""` when the plugin adds none of these.
 */
export function trustSummary(counts: TrustCounts): string {
  const sentences = [toolsSentence(counts), reachSentence(counts)];
  return sentences.filter((sentence) => sentence !== "").join(" ");
}

function toolsSentence(counts: TrustCounts): string {
  if (counts.tools === 0) return "";
  const adds = `Adds ${counted(counts.tools, "tool", "tools")} for agents`;
  const risky = counts.writes + counts.sends;
  if (risky === 0) return `${adds}.`;
  const one = risky === 1;
  const does = riskVerb(counts, one);
  if (counts.tools === 1) return `${adds}, which ${does}.`;
  return counts.tools === risky
    ? `${adds}, all of which ${does}.`
    : `${adds}, ${risky} of which ${does}.`;
}

function riskVerb(counts: TrustCounts, one: boolean): string {
  if (counts.sends === 0) return one ? "changes things" : "change things";
  if (counts.writes === 0) return one ? "sends" : "send";
  return "change things or send";
}

function reachSentence(counts: TrustCounts): string {
  const secrets =
    counts.secrets === 0
      ? undefined
      : `sends ${counted(counts.secrets, "secret", "secrets")}${
          counts.secretsTo === undefined ? "" : ` to ${counts.secretsTo}`
        }`;
  const parts = [
    counts.programs === 0
      ? undefined
      : `starts ${counted(counts.programs, "program", "programs")} on this computer`,
    secrets,
    counts.addresses === 0
      ? undefined
      : `reaches ${counted(counts.addresses, "address", "addresses")}`,
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? "" : `${capitalised(list.format(parts))}.`;
}

/**
 * How a secret goes in a request (design section 5, **How**): "Authorization header", "the
 * *name* header" or "the *field* form field". `undefined` for a program's secret, which gets it
 * from its environment.
 */
export function secretHow(
  placement: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  switch (placement?.["as"]) {
    case "bearer":
      return "Authorization header";
    case "header":
      return `the ${String(placement["header"])} header`;
    case "form":
      return `the ${String(placement["field"])} form field`;
    default:
      return undefined;
  }
}

/** A secret's host, or a setting's address in words: "the address you enter under Server". */
export function hostWords(
  host: string | { readonly fromSetting: string },
  labelOf: (setting: string) => string | undefined,
): string {
  if (typeof host === "string") return host;
  return hostFromSetting(labelOf(host.fromSetting) ?? host.fromSetting);
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
