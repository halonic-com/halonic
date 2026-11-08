// Reads what a source's `listTools` returned into the tools offered to the
// model and the refusals shown in the workspace's integration status, as
// `ports.untrusted-tool-listings` asks.

import type { ConnectorTool, IntegrationTool, ToolRisk, TrustGrant } from "@halonicjs/ports";
import { readListedTool } from "./listed-tool.ts";
import { cutName, isJsonObject, type UntrustedText } from "./listed-tool-rules.ts";
import { maxUnfencedLength, unfencedLength } from "./listed-tool-unfenced.ts";

/** One source's listing, and what the host knows around it. */
export interface ToolListingInput {
  /** The integration's or connector's id in the workspace. */
  readonly source: string;
  /**
   * What the source's `listTools` returned, unchecked. A source that
   * returns something other than a list gets one refusal and no tools.
   */
  readonly listed: readonly ConnectorTool[];
  /**
   * The tools the source declares, which Halonic reviewed: an integration's
   * `tools`. Empty for an `http` or `stdio` connector.
   */
  readonly declared: readonly IntegrationTool[];
  /**
   * The names of every other tool offered to the model in the same turn:
   * the host's own tools and the tools of every other source.
   */
  readonly otherNames: ReadonlySet<string>;
  /**
   * The trust grant for the source's workspace, or `null` when it isn't
   * trusted. Required, so a caller can't forget it. Without a grant,
   * `workspaceRisks` is ignored and every listed tool is `write`
   * (requirement `ports.connector-trust-enforcement`).
   */
  readonly trust: TrustGrant | null;
  /** The risk the workspace sets for a listed tool, by the tool's name. Used only with a grant. */
  readonly workspaceRisks?: ReadonlyMap<string, ToolRisk>;
}

/** A tool to offer the model. */
export type OfferedTool = OfferedDeclaredTool | OfferedListedTool;

/** A declared tool, offered as Halonic reviewed it: unfenced, with its declared parameters and risk. */
export interface OfferedDeclaredTool {
  readonly kind: "declared";
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly risk: ToolRisk;
  /** Whether its results reach the model only inside the untrusted fence. */
  readonly untrusted: boolean;
}

/**
 * A listed tool, which a server wrote. Its description, and every
 * `description` and `title` in its parameters, is an {@link UntrustedText}
 * the caller puts inside the untrusted fence, and its results are fenced too.
 */
export interface OfferedListedTool {
  readonly kind: "listed";
  readonly name: string;
  readonly description: UntrustedText;
  /** Rebuilt from the allow-list. */
  readonly parameters: Record<string, unknown>;
  /** `write`, unless a trusted workspace sets another risk for it. */
  readonly risk: ToolRisk;
  readonly untrusted: true;
}

/**
 * A listed tool the host refused, or a keyword it dropped from one. It is
 * shown in the workspace's integration status as plain text, and it never
 * goes to the model, since a server wrote the name.
 */
export interface ToolRefusal {
  /** The source's id. */
  readonly source: string;
  /** The listed name, cut to 64 characters. */
  readonly name: string;
  /** `tool` when the whole tool was left out, `keyword` when only part of its parameters was. */
  readonly refused: "tool" | "keyword";
  readonly reason: string;
}

/** What {@link readToolListing} gives back. */
export interface ToolListing {
  readonly tools: readonly OfferedTool[];
  readonly refusals: readonly ToolRefusal[];
}

/**
 * Reads one source's listing. A listed name the source declares gets the
 * declared tool, so a server can't swap the texts Halonic reviewed. A
 * declared tool the listing leaves out isn't offered, because the listing
 * says what the server offers now. Every other tool is a listed tool: it
 * is checked, rebuilt and marked as untrusted, or refused.
 *
 * Call it only for a source that lists its tools. Without `listTools`, an
 * integration's declared tools are the list.
 *
 * @example
 * const { tools, refusals } = readToolListing({
 *   source: "notes",
 *   listed: await connection.listTools(),
 *   declared: integration.tools,
 *   otherNames: new Set(["ask_user"]),
 *   trust: grant,
 * });
 */
export function readToolListing(input: ToolListingInput): ToolListing {
  const tools: OfferedTool[] = [];
  const refusals: ToolRefusal[] = [];
  const refuse: Refuse = (name, refused, reason) => {
    refusals.push({ source: input.source, name: nameForRefusal(name), refused, reason });
  };
  // The type says list, but a hostile source decides what `listTools` returns.
  const listed: unknown = input.listed;
  if (!Array.isArray(listed)) {
    refuse(undefined, "tool", "the listing isn't a list of tools");
    return { tools, refusals };
  }
  const declared = new Map(input.declared.map((tool) => [tool.name, tool]));
  const timesListed = countNames(input.listed);

  for (const entry of input.listed) {
    if (!isJsonObject(entry)) {
      refuse(undefined, "tool", "the listing holds an entry that isn't a tool");
      continue;
    }
    const name = entry["name"];
    const declaredTool = typeof name === "string" ? declared.get(name) : undefined;
    if (declaredTool === undefined) {
      const offer = offerListed(entry, input, timesListed, refuse);
      if (offer !== undefined) {
        tools.push(offer);
      }
    } else if (!tools.some((tool) => tool.name === declaredTool.name)) {
      tools.push(offerDeclared(declaredTool));
    }
  }
  return { tools, refusals };
}

type Refuse = (name: unknown, refused: ToolRefusal["refused"], reason: string) => void;

/** Checks one listed tool against every rule. @returns the tool to offer, or `undefined` once it is refused */
function offerListed(
  entry: ConnectorTool,
  input: ToolListingInput,
  timesListed: ReadonlyMap<string, number>,
  refuse: Refuse,
): OfferedListedTool | undefined {
  const name: unknown = entry.name;
  if (typeof name === "string" && (timesListed.get(name) ?? 0) > 1) {
    refuse(name, "tool", "the listing returns this name more than once");
    return undefined;
  }
  if (typeof name === "string" && input.otherNames.has(name)) {
    refuse(name, "tool", "another tool offered to the model has this name");
    return undefined;
  }
  const reading = readListedTool(entry);
  if (reading.kind === "refused") {
    refuse(name, "tool", reading.reason);
    return undefined;
  }
  if (unfencedLength(reading.name, reading.parameters) > maxUnfencedLength) {
    const reason = `its names and enum strings add up to more than ${maxUnfencedLength} characters`;
    refuse(name, "tool", reason);
    return undefined;
  }
  for (const path of reading.dropped) {
    refuse(name, "keyword", `dropped the keyword at ${path}`);
  }
  return {
    kind: "listed",
    name: reading.name,
    description: reading.description,
    parameters: reading.parameters,
    risk: listedRisk(reading.name, input),
    untrusted: true,
  };
}

/** A listed tool is `write`, unless a trusted workspace sets another risk for it. */
function listedRisk(name: string, input: ToolListingInput): ToolRisk {
  if (input.trust === null) {
    return "write";
  }
  return input.workspaceRisks?.get(name) ?? "write";
}

function offerDeclared(tool: IntegrationTool): OfferedDeclaredTool {
  return {
    kind: "declared",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    risk: tool.risk,
    untrusted: tool.untrusted ?? false,
  };
}

function countNames(listed: readonly ConnectorTool[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of listed) {
    const name: unknown = isJsonObject(entry) ? entry["name"] : undefined;
    if (typeof name === "string") {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

/** A hostile source can send a name that isn't text; the refusal still needs something to show. */
function nameForRefusal(name: unknown): string {
  return typeof name === "string" ? cutName(name) : "(a name that isn't text)";
}
