// What a person reviewing waiting listed tools needs besides the check
// itself: the review of one source, in the order both front ends show it,
// approving one tool by name at the fingerprint they were shown, and what
// changed since its approval, with the changes a person can't see marked.
// `halonic tools` (HAL-2827) and the Studio screen (HAL-2213) only format
// what these give back.

import type {
  Clock,
  ListedToolFingerprint,
  ListedToolText,
  ToolApprovalStore,
} from "@halonicjs/ports";
import {
  approveWaitingTool,
  type ListedToolApprovalCheck,
  type UnreadableApproval,
  type WaitingTool,
} from "./approve-listed-tools.ts";

/**
 * A waiting tool's state, the word both front ends show for it:
 * `changed` when it has an approval ("Changed"), `not_approved` when it
 * never had one, is new, or its approval was removed ("Not approved").
 */
export type WaitingState = "changed" | "not_approved";

/** One waiting tool as the review shows it. */
export interface ReviewedTool {
  readonly state: WaitingState;
  readonly waiting: WaitingTool;
  /**
   * What changed in its text since it was approved, from
   * {@link listedToolChanges}. Empty when it was never approved, and when
   * only its server changed (`waiting.serverChanged`).
   */
  readonly changes: readonly ListedToolChange[];
  /** Why parts of its arguments were left out, one reason per refused keyword, for "Halonic left out part of its arguments". */
  readonly leftOutArguments: readonly string[];
}

/** A tool Halonic refused while reading the listing: it can't be approved. */
export interface RefusedListedTool {
  /** Its name as the server listed it, cut and escaped as in the refusal. */
  readonly name: string;
  readonly reason: string;
}

/** One source's listed tools as a person reviews them, from {@link reviewListedTools}. */
export interface ListedToolReview {
  readonly source: string;
  /** The listed tools that are on, by the name their server lists them under, in listing order. */
  readonly on: readonly string[];
  /** The declared tools, which come with the integration and are never reviewed here. */
  readonly declared: readonly string[];
  /** The tools to ask about: Changed first, then Not approved, each in listing order. */
  readonly toReview: readonly ReviewedTool[];
  /** The tools Halonic refused, in listing order. */
  readonly refused: readonly RefusedListedTool[];
  /** The tools their server keeps changing: shown, never asked about, in listing order. */
  readonly keepsChanging: readonly ReviewedTool[];
  /** Why Halonic refused the whole listing, so none of its tools is on; else `null`. */
  readonly listingRefused: string | null;
  /** The approval that can't be read, so none of the listed tools is on; else `null`. */
  readonly unreadable: UnreadableApproval | null;
}

/**
 * Puts one source's check in the order and the states Studio and
 * `halonic tools review` show it in: the tools to ask about (Changed, then
 * Not approved), the refused tools, and the tools their server keeps
 * changing, each with what changed since its approval.
 *
 * @example
 * const review = reviewListedTools(check);
 * for (const reviewed of review.toReview) ask(reviewed.waiting.listedName, reviewed.changes);
 */
export function reviewListedTools(check: ListedToolApprovalCheck): ListedToolReview {
  const reviewed = check.waiting.map((waiting) => reviewedTool(check, waiting));
  const asked = reviewed.filter((tool) => !tool.waiting.keepsChanging);
  return {
    source: check.source,
    on: check.tools.flatMap((tool) => (tool.kind === "listed" ? [tool.listedName] : [])),
    declared: check.tools.flatMap((tool) => (tool.kind === "declared" ? [tool.name] : [])),
    toReview: [
      ...asked.filter((tool) => tool.state === "changed"),
      ...asked.filter((tool) => tool.state === "not_approved"),
    ],
    refused: check.refusals.flatMap((refusal) =>
      refusal.refused === "tool" ? [{ name: refusal.name ?? "", reason: refusal.reason }] : [],
    ),
    keepsChanging: reviewed.filter((tool) => tool.waiting.keepsChanging),
    listingRefused: check.refusals.find((refusal) => refusal.refused === "listing")?.reason ?? null,
    unreadable: check.unreadable,
  };
}

function reviewedTool(check: ListedToolApprovalCheck, waiting: WaitingTool): ReviewedTool {
  return {
    state: waiting.approved === null ? "not_approved" : "changed",
    waiting,
    changes: waiting.approved === null ? [] : listedToolChanges(waiting.approved, waiting.tool),
    leftOutArguments: check.refusals.flatMap((refusal) =>
      refusal.refused === "keyword" && refusal.name === waiting.listedName ? [refusal.reason] : [],
    ),
  };
}

/** What {@link approveNamedTool} did. Only `approved` stored anything. */
export type NamedToolApproval =
  /** It approved the tool at the fingerprint shown. */
  | { readonly outcome: "approved"; readonly waiting: WaitingTool }
  /** The tool is waiting at another fingerprint than the person asked for. */
  | { readonly outcome: "changed"; readonly waiting: WaitingTool }
  /** The tool is on: it is approved already, as it is now. */
  | { readonly outcome: "already_approved" }
  /** Halonic refused the tool while reading the listing, so it can't be approved. */
  | { readonly outcome: "refused"; readonly reason: string }
  /** The source lists no tool by that name; `listed` has the names it does list, for "Did you mean". */
  | { readonly outcome: "not_listed"; readonly listed: readonly string[] }
  /** One of the source's approvals can't be read, so none of its listed tools can be told apart. */
  | { readonly outcome: "unreadable"; readonly unreadable: UnreadableApproval };

/**
 * Approves one waiting tool by the name its server lists it under, as
 * `halonic tools approve <source> <tool>` does. With `fingerprint`, it
 * approves only when the tool is waiting at exactly that fingerprint, so a
 * person who read one version never approves another. It approves a tool
 * its server keeps changing too: approving by name is how a person approves
 * one on purpose.
 *
 * @param fingerprint - the fingerprint the person was shown, when they give one
 *
 * @example
 * const result = await approveNamedTool(check, "lookup", store, clock, "htl1:9f86d0…");
 * if (result.outcome === "changed") show(result.waiting.fingerprint);
 */
export async function approveNamedTool(
  check: ListedToolApprovalCheck,
  name: string,
  store: ToolApprovalStore,
  clock: Clock,
  fingerprint?: ListedToolFingerprint,
): Promise<NamedToolApproval> {
  if (check.unreadable !== null) {
    return { outcome: "unreadable", unreadable: check.unreadable };
  }
  const waiting = check.waiting.find((tool) => tool.listedName === name);
  if (waiting === undefined) {
    return notWaiting(check, name);
  }
  if (fingerprint !== undefined && waiting.fingerprint !== fingerprint) {
    return { outcome: "changed", waiting };
  }
  await approveWaitingTool(check, waiting, store, clock);
  return { outcome: "approved", waiting };
}

/** Why the tool `name` isn't waiting: it is on, refused or not listed. */
function notWaiting(check: ListedToolApprovalCheck, name: string): NamedToolApproval {
  const on = check.tools.some((tool) => tool.kind === "listed" && tool.listedName === name);
  if (on) {
    return { outcome: "already_approved" };
  }
  const refusal = check.refusals.find((found) => found.refused === "tool" && found.name === name);
  if (refusal !== undefined) {
    return { outcome: "refused", reason: refusal.reason };
  }
  const listed = [
    ...check.tools.flatMap((tool) => (tool.kind === "listed" ? [tool.listedName] : [])),
    ...check.waiting.map((tool) => tool.listedName),
  ];
  return { outcome: "not_listed", listed };
}

/**
 * Why two different texts can look the same to a person:
 *
 * - `normalization`: the same characters, written in another Unicode form
 *   (NFC and NFD of `é`).
 * - `whitespace`: they differ only in spaces, tabs or line breaks, such as
 *   a trailing space.
 * - `lookalike`: they differ only where one of them has a character outside
 *   ASCII, such as a Cyrillic `а` for a Latin `a`.
 */
export type HiddenChange = "normalization" | "whitespace" | "lookalike";

/** One text of a listed tool that changed since it was approved. */
export interface ListedToolChange {
  /** Where the text is, such as `description` or `parameters.properties.title.description`. */
  readonly path: string;
  /** The text as approved, or `null` when it is new. */
  readonly before: string | null;
  /** The text now, or `null` when it was removed. */
  readonly after: string | null;
  /** Why a person might not see the change, or `null` when it shows. */
  readonly hidden: HiddenChange | null;
}

/**
 * The texts of a listed tool that changed since it was approved, in the
 * order of their paths. A value that isn't text, such as a `type`, an
 * `enum` or a limit, is written as JSON, so every change the fingerprint
 * covers shows up here.
 *
 * @example
 * listedToolChanges(waiting.approved, waiting.tool);
 * // => [{ path: "description", before: "Finds a note.", after: "Finds a nоte.", hidden: "lookalike" }]
 */
export function listedToolChanges(
  approved: ListedToolText,
  now: ListedToolText,
): ListedToolChange[] {
  const before = textsByPath(approved);
  const after = textsByPath(now);
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes: ListedToolChange[] = [];
  for (const path of paths) {
    const was = before.get(path) ?? null;
    const is = after.get(path) ?? null;
    if (was !== is) {
      changes.push({ path, before: was, after: is, hidden: hiddenChange(was, is) });
    }
  }
  return changes;
}

/** Every leaf of a tool as text, keyed by its dotted path. */
function textsByPath(tool: ListedToolText): Map<string, string> {
  const texts = new Map<string, string>();
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      texts.set(path, value);
    } else if (Array.isArray(value) || value === null || typeof value !== "object") {
      texts.set(path, JSON.stringify(value));
    } else {
      for (const [key, inner] of Object.entries(value)) {
        walk(inner, `${path}.${key}`);
      }
    }
  };
  texts.set("name", tool.name);
  texts.set("description", tool.description);
  walk(tool.parameters, "parameters");
  return texts;
}

function hiddenChange(before: string | null, after: string | null): HiddenChange | null {
  if (before === null || after === null) {
    return null;
  }
  if (before.normalize("NFC") === after.normalize("NFC")) {
    return "normalization";
  }
  if (withoutWhitespace(before) === withoutWhitespace(after)) {
    return "whitespace";
  }
  return differsOnlyOutsideAscii(before, after) ? "lookalike" : null;
}

function withoutWhitespace(text: string): string {
  return text.replace(/\s+/gu, "");
}

/** Whether the texts have as many characters, and every one that differs is outside ASCII on one side. */
function differsOnlyOutsideAscii(before: string, after: string): boolean {
  const left = Array.from(before);
  const right = Array.from(after);
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (character, index) =>
      character === right[index] || !isAscii(character) || !isAscii(right[index] ?? ""),
  );
}

function isAscii(character: string): boolean {
  return (character.codePointAt(0) ?? 0x80) < 0x80;
}
