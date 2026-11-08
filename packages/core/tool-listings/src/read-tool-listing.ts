import type { ConnectorTool } from "@halonicjs/ports";
import { maxListedTools, maxNameLength } from "./limits.ts";
import { hasStringName, type ListedTool, readListedTool } from "./read-listed-tool.ts";

/** What {@link readToolListing} reads: one source's listing and what it is checked against. */
export interface ToolListing {
  /** The source's id: the integration's name or the connector's id. */
  readonly source: string;
  /** The tools the source declares, which Halonic reviewed. Empty for an `http` or `stdio` connector. */
  readonly declared: readonly ConnectorTool[];
  /** What the source's `listTools` returned. A hostile server may send any shape, so it is checked. */
  readonly listed: readonly unknown[];
  /** The names of the other tools offered to the model in the same turn, such as host tools. */
  readonly otherToolNames: readonly string[];
}

/** A declared tool the listing names, offered as it was declared. */
export interface DeclaredTool {
  readonly kind: "declared";
  /** The id of the source that declares it. */
  readonly source: string;
  /** The declared tool, unchanged. */
  readonly tool: ConnectorTool;
}

/** A tool to offer the model. */
export type OfferedTool = DeclaredTool | ListedTool;

/**
 * Why a listed tool was refused, or one of its keywords dropped. It can hold
 * text the server wrote, so it never reaches the model; the workspace's
 * integration status shows it as plain text.
 */
export interface ToolRefusal {
  readonly source: string;
  /** The listed name, cut to 64 characters. Absent when the tool had no name, or the refusal is about the whole listing. */
  readonly name?: string;
  /** Why. Text from the listing in it is cut to 64 characters and escaped. */
  readonly reason: string;
}

/** What {@link readToolListing} returns. */
export interface ToolListingResult {
  readonly offered: OfferedTool[];
  readonly refusals: ToolRefusal[];
}

/**
 * Reads one source's tool listing the way requirement
 * `ports.untrusted-tool-listings` says. A listed name that the source
 * declares gives the declared tool, unchanged; a declared tool the listing
 * leaves out is not offered. Every other listed tool is checked and rebuilt
 * from the allow-list, or refused. Tool assembly renders the fence around
 * the texts of the listed tools it gets back.
 *
 * @example
 * const { offered, refusals } = readToolListing({
 *   source: "files",
 *   declared: [],
 *   listed: await connection.listTools(),
 *   otherToolNames: ["ask_user"],
 * });
 */
export function readToolListing(listing: ToolListing): ToolListingResult {
  const declaredByName = new Map(listing.declared.map((tool) => [tool.name, tool]));
  const offered: OfferedTool[] = offerDeclared(listing, declaredByName);
  const refusals: ToolRefusal[] = [];
  if (listing.listed.length > maxListedTools) {
    refusals.push({
      source: listing.source,
      reason: `the listing returned ${listing.listed.length} tools, more than ${maxListedTools}, so none of its undeclared tools is offered`,
    });
    return { offered, refusals };
  }
  const check: ClashCheck = {
    listedNameCounts: countListedNames(listing.listed, declaredByName),
    otherToolNames: new Set(listing.otherToolNames),
  };
  for (const listed of listing.listed) {
    if (hasStringName(listed) && declaredByName.has(listed.name)) {
      continue;
    }
    const outcome = readUndeclared(listing.source, listed, check);
    if (outcome.tool !== undefined) {
      offered.push(outcome.tool);
    }
    refusals.push(...outcome.refusals);
  }
  return { offered, refusals };
}

/** The declared tools the listing names, each once, in the listing's order. */
function offerDeclared(
  listing: ToolListing,
  declaredByName: ReadonlyMap<string, ConnectorTool>,
): DeclaredTool[] {
  const offered = new Map<string, DeclaredTool>();
  for (const listed of listing.listed) {
    if (!hasStringName(listed) || offered.has(listed.name)) {
      continue;
    }
    const declared = declaredByName.get(listed.name);
    if (declared !== undefined) {
      offered.set(listed.name, { kind: "declared", source: listing.source, tool: declared });
    }
  }
  return [...offered.values()];
}

/** What the clash rules compare a listed name with. */
interface ClashCheck {
  readonly listedNameCounts: ReadonlyMap<string, number>;
  readonly otherToolNames: ReadonlySet<string>;
}

/** Reads one listed tool that the source doesn't declare: the tool to offer, if any, and its refusals. */
function readUndeclared(
  source: string,
  listed: unknown,
  check: ClashCheck,
): { tool?: ListedTool; refusals: ToolRefusal[] } {
  if (!hasStringName(listed)) {
    return { refusals: [{ source, reason: "a listed tool isn't an object with a string name" }] };
  }
  const name = cutName(listed.name);
  if ((check.listedNameCounts.get(listed.name) ?? 0) > 1) {
    return { refusals: [{ source, name, reason: "the listing returns this name more than once" }] };
  }
  if (check.otherToolNames.has(listed.name)) {
    return {
      refusals: [{ source, name, reason: "another tool offered in the same turn has this name" }],
    };
  }
  const outcome = readListedTool(source, listed.name, listed);
  if (!outcome.ok) {
    return { refusals: [{ source, name, reason: outcome.reason }] };
  }
  return {
    tool: outcome.tool,
    refusals: outcome.dropped.map((reason) => ({ source, name, reason })),
  };
}

/** How often the listing returns each name that the source doesn't declare. */
function countListedNames(
  listed: readonly unknown[],
  declaredByName: ReadonlyMap<string, ConnectorTool>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tool of listed) {
    if (hasStringName(tool) && !declaredByName.has(tool.name)) {
      counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
    }
  }
  return counts;
}

/** The first 64 characters of a name, never splitting a character. */
function cutName(name: string): string {
  return Array.from(name.slice(0, maxNameLength * 2))
    .slice(0, maxNameLength)
    .join("");
}
