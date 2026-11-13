import type { ListedToolReview, ReviewedTool } from "@halonicjs/app/listed-tools";
import type {
  ListedToolArgument,
  ListedToolRow,
  ListedToolsSnapshot,
} from "./listed-tools-host.ts";

/**
 * Puts one connector's review from `reviewListedTools` into the shape the
 * review dialog reads. The texts a tool changed since its approval come from
 * the review's `changes`, so the dialog shows the approved version the store
 * kept, never an old listing.
 *
 * @param sourceName - the connector's name, as on its card
 *
 * @example
 * const snapshot = listedToolsSnapshot("Notes", reviewListedTools(check.value));
 * snapshot.toReview[0]?.differences; // [{ path: "description", before: "…", after: "…", hidden: null }]
 */
export function listedToolsSnapshot(
  sourceName: string,
  review: ListedToolReview,
): ListedToolsSnapshot {
  return {
    sourceName,
    toReview: review.toReview.map(listedToolRow),
    keepsChanging: review.keepsChanging.map(listedToolRow),
    refused: review.refused,
    approved: review.on,
    listingRefused: review.listingRefused,
    unreadable: unreadableApproval(review),
    hasApprovals: hasApprovals(review),
  };
}

function unreadableApproval(review: ListedToolReview): ListedToolsSnapshot["unreadable"] {
  if (review.unreadable === null) {
    return null;
  }
  const { toolName } = review.unreadable;
  return toolName === null ? {} : { toolName };
}

function hasApprovals(review: ListedToolReview): boolean {
  const waiting = [...review.toReview, ...review.keepsChanging];
  return review.on.length > 0 || waiting.some((tool) => tool.state === "changed");
}

function listedToolRow(reviewed: ReviewedTool): ListedToolRow {
  const { waiting } = reviewed;
  return {
    name: waiting.listedName,
    fingerprint: waiting.fingerprint,
    description: waiting.tool.description,
    arguments: toolArguments(waiting.tool.parameters),
    state: reviewed.state,
    differences: reviewed.changes.map((change) => ({ ...change })),
    serverChanged: waiting.serverChanged,
    leftOutArguments: reviewed.leftOutArguments,
  };
}

function toolArguments(parameters: Record<string, unknown>): ListedToolArgument[] {
  const properties = parameters["properties"];
  if (typeof properties !== "object" || properties === null) {
    return [];
  }
  return Object.entries(properties).map(([name, schema]) => argumentOf(name, schema));
}

function argumentOf(name: string, schema: unknown): ListedToolArgument {
  if (typeof schema !== "object" || schema === null) {
    return { name };
  }
  const { type, description } = schema as { type?: unknown; description?: unknown };
  return {
    name,
    ...(typeof type === "string" ? { type } : {}),
    ...(typeof description === "string" ? { description } : {}),
  };
}
