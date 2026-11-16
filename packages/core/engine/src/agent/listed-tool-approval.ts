// The approval step between a connector's listing and the fence (HAL-850
// step 4): a listed tool is offered to the model only when a person approved
// the tool as it is now. Every other listed tool waits, and nothing about it
// goes to the model.

import { readToolListing, type ToolListing, type ToolRefusal } from "@halonicjs/app";
import { approveListedTools, escapeListedText } from "@halonicjs/app/listed-tools";
import type {
  ChatTurnRefusal,
  ChatTurnWaiting,
  Clock,
  ConnectorTool,
  Digest,
  ToolApprovalStore,
  ToolServer,
} from "@halonicjs/ports";

/** Where a connector's tools are approved, and what the engine does with that. */
export type ConnectorToolAddress =
  /** Its tools are listed by a server at this address, so a person approves each one. */
  | { readonly kind: "listed"; readonly server: ToolServer }
  /**
   * Its tools are ones Halonic reviewed: an integration's, a plugin's or
   * the built-in Google connector's. They aren't listed tools, so they
   * never ask.
   */
  | { readonly kind: "reviewed" }
  /** It has no address its tools could be approved at, so its listed tools wait. */
  | { readonly kind: "unaddressable"; readonly reason: string };

/** What the engine needs to check listed tools against the approvals a person gave. */
export interface ListedToolApprovalStore {
  readonly kind: "store";
  /** The workspace's resolved real path, as in a `TrustRecord`. */
  readonly location: string;
  readonly store: ToolApprovalStore;
  readonly digest: Digest;
  readonly clock: Clock;
  /**
   * The address of a connector's server, taken from the same place
   * `halonic tools approve` takes it from (`connectorToolServer`), so an
   * approval given there matches a run.
   */
  addressOf(connector: string): Promise<ConnectorToolAddress>;
  /**
   * Hears the listed tools of a connector that wait, once for each turn that
   * leaves some out, so the host can say which command approves them. The
   * names are cut and escaped. The text goes to a person, never the model.
   */
  reportWaiting?(connector: string, waiting: readonly ChatTurnWaiting[]): void;
}

/** A caller with nobody to ask and nothing to check against: every listed tool waits. */
export interface NoListedToolApproval {
  readonly kind: "none";
}

/**
 * A caller whose connectors are all written by the caller: the scripted
 * tools of a test run. No server lists anything, so there is nothing to
 * approve. A host that connects real servers never passes this.
 */
export interface AllToolsReviewed {
  readonly kind: "reviewed";
}

/**
 * What a caller gives the engine so listed tools can be approved. It is
 * required, so each caller chooses: a caller with no approval store passes
 * {@link noListedToolApproval}, which keeps every listed tool off.
 */
export type ListedToolApproval = ListedToolApprovalStore | NoListedToolApproval | AllToolsReviewed;

/** Every listed tool waits, as in the cloud runtime, which has no profile store yet. */
export const noListedToolApproval: NoListedToolApproval = { kind: "none" };

/** Every connector's tools are the caller's own, so none needs approval. Only for scripted tools. */
export const allToolsReviewed: AllToolsReviewed = { kind: "reviewed" };

/** One connector's listing after the approval step. */
export interface ApprovedListing {
  /** What the server listed, kept to the tools that may go on to the fence. */
  readonly listed: readonly ConnectorTool[];
  /** The listed tools left out because nobody approved them as they are now. */
  readonly waiting: readonly ChatTurnWaiting[];
  /** Refusals of the listing and of single tools, which never go to the model. */
  readonly refusals: readonly ChatTurnRefusal[];
}

/**
 * Checks one connector's listing against the approvals, as every turn does:
 * an approval a person revoked since the last turn, and a tool whose text
 * changed, take effect at once. Declared and reviewed tools aren't listed
 * tools and pass as they are.
 *
 * @example
 * const { listed, waiting } = await approveConnectorListing(approval, "notes", await client.listTools());
 * // `listed` goes on to `offerListedTools`; `waiting` goes to the status view
 */
export async function approveConnectorListing(
  approval: ListedToolApproval,
  connector: string,
  listed: readonly ConnectorTool[],
): Promise<ApprovedListing> {
  if (approval.kind === "reviewed") {
    return { listed, waiting: [], refusals: [] };
  }
  const address: ConnectorToolAddress | null =
    approval.kind === "store" ? await approval.addressOf(connector) : null;
  if (address?.kind === "reviewed") {
    return { listed, waiting: [], refusals: [] };
  }
  const listing = readToolListing({
    source: connector,
    listed,
    declared: [],
    otherNames: new Set(),
    // Approval covers a tool's text, which the trust grant doesn't change; the risk comes from `offerListedTools`.
    trust: null,
  });
  if (approval.kind === "none" || address?.kind !== "listed") {
    const refusals =
      address?.kind === "unaddressable" ? [listingRefusal(connector, address.reason)] : [];
    return noneOffered(connector, listing, refusals, approval);
  }
  const check = await approveListedTools({
    location: approval.location,
    source: connector,
    server: address.server,
    listing,
    store: approval.store,
    digest: approval.digest,
    clock: approval.clock,
  });
  if (check.unreadable !== null) {
    const reason = "couldn't read its tool approvals, so none of its listed tools is offered";
    return { listed: [], waiting: [], refusals: [listingRefusal(connector, reason)] };
  }
  const approved = new Set(
    check.tools.flatMap((tool) => (tool.kind === "listed" ? [tool.listedName] : [])),
  );
  const waiting = check.waiting.map((tool) => waitingTool(connector, tool.listedName));
  reportWaiting(approval, connector, waiting);
  return {
    listed: listed.filter((entry) => {
      const name = nameOf(entry);
      return name !== undefined && approved.has(name);
    }),
    waiting,
    refusals: withoutKeywords(check.refusals),
  };
}

/** Every listed tool waits: nobody can approve them here. */
function noneOffered(
  connector: string,
  listing: ToolListing,
  more: readonly ChatTurnRefusal[],
  approval: ListedToolApproval,
): ApprovedListing {
  const waiting = listing.tools.flatMap((tool) =>
    tool.kind === "listed" ? [waitingTool(connector, tool.listedName)] : [],
  );
  if (approval.kind === "store") reportWaiting(approval, connector, waiting);
  return { listed: [], waiting, refusals: [...withoutKeywords(listing.refusals), ...more] };
}

function waitingTool(source: string, listedName: string): ChatTurnWaiting {
  return { source, name: escapeListedText(listedName) };
}

function listingRefusal(source: string, reason: string): ChatTurnRefusal {
  return { source, refused: "listing", reason };
}

/** The tools of a keyword refusal are still offered, and `offerListedTools` words that refusal. */
function withoutKeywords(refusals: readonly ToolRefusal[]): ChatTurnRefusal[] {
  return refusals.filter((refusal) => refusal.refused !== "keyword");
}

function reportWaiting(
  approval: ListedToolApprovalStore,
  connector: string,
  waiting: readonly ChatTurnWaiting[],
): void {
  if (waiting.length > 0) approval.reportWaiting?.(connector, waiting);
}

/** The name an entry lists its tool under; `readToolListing` already refused any entry without one. */
function nameOf(entry: ConnectorTool): string | undefined {
  const name: unknown = (entry as { name?: unknown } | null)?.name;
  return typeof name === "string" ? name : undefined;
}
