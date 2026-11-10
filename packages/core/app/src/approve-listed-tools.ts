// Checks a source's listed tools against what a person approved, and
// approves the tools a person chose, as `ports.listed-tool-approval` asks.
// Studio and the CLI both go through here, so they share one rule.

import {
  type Clock,
  type Digest,
  isUnreadableToolApprovalError,
  type ListedToolFingerprint,
  type ListedToolText,
  type ToolApproval,
  type ToolApprovalStore,
  type ToolServer,
  type WaitingVersion,
} from "@halonicjs/ports";
import {
  listedToolFingerprint,
  listedToolText,
  sameToolServer,
} from "./listed-tool-fingerprint.ts";
import type { OfferedListedTool, OfferedTool, ToolListing, ToolRefusal } from "./tool-listing.ts";

/** One source's listing as `readToolListing` gave it back, and where it came from. */
export interface ListedToolApprovalInput {
  /** The workspace's resolved real path, as in a `TrustRecord`. */
  readonly location: string;
  /** The integration's or connector's id in the workspace. */
  readonly source: string;
  /** The address of the server the listing came from, now. */
  readonly server: ToolServer;
  readonly listing: ToolListing;
  readonly store: ToolApprovalStore;
  readonly digest: Digest;
  readonly clock: Clock;
}

/** A listed tool that is off until a person approves it. */
export interface WaitingTool {
  /** The name the server lists it under, without the source's id. */
  readonly listedName: string;
  /** Its fingerprint now: what a person approves when they approve it. */
  readonly fingerprint: ListedToolFingerprint;
  /** The tool now, as the model would see it. */
  readonly tool: ListedToolText;
  /** The tool as it was approved, so the screen can show what changed, or `null` when it never was. */
  readonly approved: ListedToolText | null;
  /**
   * `true` when it was approved at another server address: the workspace
   * points the source at another URL or command, or gives the integration
   * another version or settings. When its text is the same too, this is the
   * only reason it waits, and `listedToolChanges` finds nothing to show.
   */
  readonly serverChanged: boolean;
  /**
   * `true` once its server keeps changing it: the host asks nothing about
   * it, gives it no badge, and leaves it out of "Approve all". A person can
   * still approve it by name.
   */
  readonly keepsChanging: boolean;
}

/** What {@link approveListedTools} gives back. */
export interface ListedToolApprovalCheck {
  readonly location: string;
  readonly source: string;
  readonly server: ToolServer;
  /** The declared tools, and the listed tools whose approval matches. Only these go on to the fence and the model. */
  readonly tools: readonly OfferedTool[];
  /** Every other listed tool, in listing order. */
  readonly waiting: readonly WaitingTool[];
  /** The listing's refusals, and a refusal for each tool that can't have a fingerprint. */
  readonly refusals: readonly ToolRefusal[];
  /** When one of the source's approvals can't be read, which one; none of its listed tools is offered then. Else `null`. */
  readonly unreadable: UnreadableApproval | null;
}

/** An approval of the source that can't be read, so none of its listed tools is offered. */
export interface UnreadableApproval {
  /**
   * The tool's name as the server lists it, for the words "Couldn't read
   * your approval for *lookup*", or `null` when neither the store nor the
   * listing can tell which tool it is for.
   */
  readonly toolName: string | null;
  /** What the store threw, for the log. Its message isn't text a person reads. */
  readonly error: unknown;
}

/** How many different versions a server may show of one tool within {@link changeWindowMs} before the host stops asking. */
export const changesBeforeQuiet = 3;

/** The window {@link changesBeforeQuiet} counts in: 24 hours. */
export const changeWindowMs = 24 * 60 * 60 * 1000;

/**
 * Checks one source's listing against its approvals. A listed tool is
 * offered only when its approval has the same server and the same
 * fingerprint; every other listed tool is waiting, and noted with the store
 * so the host can stop asking about a tool its server keeps changing. The
 * check only removes tools: it doesn't fence them, check arguments or change
 * a tool's risk.
 *
 * @example
 * const check = await approveListedTools({
 *   location: "/workspaces/acme",
 *   source: "notes",
 *   server: unwrap(await httpToolServer(transport.url, transport.headers, digest)),
 *   listing: readToolListing(input),
 *   store,
 *   digest,
 *   clock,
 * });
 * // check.tools go on to the fence; check.waiting go to the approval screen
 */
export async function approveListedTools(
  input: ListedToolApprovalInput,
): Promise<ListedToolApprovalCheck> {
  const declared = input.listing.tools.filter((tool) => tool.kind === "declared");
  const listed = input.listing.tools.filter((tool) => tool.kind === "listed");
  const where = { location: input.location, source: input.source, server: input.server };
  const tools: OfferedTool[] = [...declared];
  const waiting: WaitingTool[] = [];
  const refusals: ToolRefusal[] = [...input.listing.refusals];

  let approvals: Map<string, ToolApproval>;
  try {
    const list = await input.store.list(input.location, input.source);
    approvals = new Map(list.map((approval) => [approval.name, approval]));
  } catch (error) {
    const unreadable = await unreadableApproval(input, listed, error);
    return { ...where, tools, waiting, refusals, unreadable };
  }

  for (const tool of listed) {
    const text = listedToolText(tool);
    const fingerprint = await listedToolFingerprint(text, input.digest);
    if (!fingerprint.ok) {
      refusals.push(fingerprintRefusal(input.source, tool, fingerprint.error));
      continue;
    }
    const approval = approvals.get(tool.listedName);
    const serverChanged = approval !== undefined && !sameToolServer(approval.server, input.server);
    if (approval !== undefined && approval.fingerprint === fingerprint.value && !serverChanged) {
      tools.push(tool);
      continue;
    }
    const versions = await input.store.noteWaiting(
      { location: input.location, source: input.source, name: tool.listedName },
      { fingerprint: fingerprint.value, firstSeenAt: input.clock.now().toISOString() },
    );
    waiting.push({
      listedName: tool.listedName,
      fingerprint: fingerprint.value,
      tool: text,
      approved: approval?.tool ?? null,
      serverChanged,
      keepsChanging: keepsChanging(versions, input.clock.now()),
    });
  }
  return { ...where, tools, waiting, refusals, unreadable: null };
}

/**
 * Which approval `error` is about. A damaged approval may not say which tool
 * it is for, so when the store's error doesn't name one, each listed tool's
 * approval is read by its key until one fails the same way.
 */
async function unreadableApproval(
  input: ListedToolApprovalInput,
  listed: readonly OfferedListedTool[],
  error: unknown,
): Promise<UnreadableApproval> {
  if (!isUnreadableToolApprovalError(error)) {
    return { toolName: null, error };
  }
  if (error.toolName !== null) {
    return { toolName: error.toolName, error };
  }
  for (const tool of listed) {
    const key = { location: input.location, source: input.source, name: tool.listedName };
    const found = await input.store.get(key).then(
      () => null,
      (problem: unknown) => problem,
    );
    if (isUnreadableToolApprovalError(found) && found.toolName !== null) {
      return { toolName: found.toolName, error: found };
    }
  }
  return { toolName: null, error };
}

function fingerprintRefusal(source: string, tool: OfferedListedTool, problem: string): ToolRefusal {
  return {
    source,
    name: tool.listedName,
    refused: "tool",
    reason: `its text can't be fingerprinted: ${problem}`,
  };
}

/**
 * Whether a server keeps changing a tool: more than {@link changesBeforeQuiet}
 * different versions first seen within {@link changeWindowMs} before now.
 * Once they are all older, the tool is asked about again.
 */
export function keepsChanging(versions: readonly WaitingVersion[], now: Date): boolean {
  const since = now.getTime() - changeWindowMs;
  const recent = new Set(
    versions
      .filter((version) => Date.parse(version.firstSeenAt) > since)
      .map((version) => version.fingerprint),
  );
  return recent.size > changesBeforeQuiet;
}

/**
 * Approves one waiting tool at the fingerprint and text the person was
 * shown, never at one computed again now. It works for a tool its server
 * keeps changing too: that is how a person approves one on purpose.
 *
 * `waiting` must be one of `check.waiting`: the same name at the same
 * fingerprint. The text stored is the check's, so a caller can't approve
 * text the check never showed. Anything else is a bug in the caller, and
 * throws {@link NotShownToolError} before anything is approved.
 *
 * @example
 * await approveWaitingTool(check, check.waiting[0], store, clock);
 */
export async function approveWaitingTool(
  check: ListedToolApprovalCheck,
  waiting: WaitingTool,
  store: ToolApprovalStore,
  clock: Clock,
): Promise<void> {
  await approveShownTool(check, shownInCheck(check, waiting), store, clock);
}

/** Thrown when a caller passes a waiting tool that didn't come from the check it passes. */
export class NotShownToolError extends Error {
  readonly listedName: string;

  constructor(check: ListedToolApprovalCheck, waiting: WaitingTool) {
    super(
      `"${waiting.listedName}" at ${waiting.fingerprint} isn't waiting in this check of "${check.source}", so it can't be approved.`,
    );
    this.name = "NotShownToolError";
    this.listedName = waiting.listedName;
  }
}

/** The check's own entry for `waiting`, matched by name and fingerprint. */
function shownInCheck(check: ListedToolApprovalCheck, waiting: WaitingTool): WaitingTool {
  const shown = check.waiting.find(
    (candidate) =>
      candidate.listedName === waiting.listedName && candidate.fingerprint === waiting.fingerprint,
  );
  if (shown === undefined) {
    throw new NotShownToolError(check, waiting);
  }
  return shown;
}

async function approveShownTool(
  check: ListedToolApprovalCheck,
  shown: WaitingTool,
  store: ToolApprovalStore,
  clock: Clock,
): Promise<void> {
  await store.approve({
    location: check.location,
    source: check.source,
    name: shown.listedName,
    server: check.server,
    fingerprint: shown.fingerprint,
    tool: shown.tool,
    approvedAt: clock.now().toISOString(),
  });
}

/** What {@link approveAllShown} did. */
export interface ApproveAllResult {
  /** The tools it approved, in the order shown. */
  readonly approved: readonly WaitingTool[];
  /** The tools shown that it left out because their server keeps changing them, in the order shown. */
  readonly leftOut: readonly WaitingTool[];
}

/**
 * "Approve all" in Studio and `halonic tools approve <source> --all`:
 * approves exactly the waiting tools shown, each at the fingerprint shown,
 * and nothing else. Pass only what a search filter shows, when one is on.
 * A tool its server keeps changing is left out, and named in `leftOut` so
 * the person can approve it by name. A refused tool is never in `shown`,
 * and a later change or a new tool isn't either, so neither is approved.
 *
 * Every tool in `shown` must be one of `check.waiting`, as for
 * {@link approveWaitingTool}. All of them are checked first, so a bad entry
 * throws {@link NotShownToolError} with nothing approved. Whether a tool
 * keeps changing is read from the check, not from `shown`.
 *
 * @example
 * const { approved, leftOut } = await approveAllShown(check, check.waiting, store, clock);
 */
export async function approveAllShown(
  check: ListedToolApprovalCheck,
  shown: readonly WaitingTool[],
  store: ToolApprovalStore,
  clock: Clock,
): Promise<ApproveAllResult> {
  const fromCheck = shown.map((waiting) => shownInCheck(check, waiting));
  const approved = fromCheck.filter((waiting) => !waiting.keepsChanging);
  for (const waiting of approved) {
    await approveShownTool(check, waiting, store, clock);
  }
  return { approved, leftOut: fromCheck.filter((waiting) => waiting.keepsChanging) };
}
