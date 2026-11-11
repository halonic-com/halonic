// Reads what a source's `listTools` returned into the tools offered to the
// model and the refusals shown in the workspace's integration status, as
// `ports.untrusted-tool-listings` asks.

import { type Connector, marksRead } from "@halonicjs/format";
import type { ConnectorTool, IntegrationTool, ToolRisk, TrustGrant } from "@halonicjs/ports";
import { readListedTool } from "./listed-tool.ts";
import {
  escapeListedText,
  isJsonObject,
  maxListedTools,
  passesNameRule,
  type UntrustedText,
} from "./listed-tool-rules.ts";
import { maxUnfencedLength, unfencedLength } from "./listed-tool-unfenced.ts";

/** One source's listing, and what the host knows around it. */
export interface ToolListingInput {
  /**
   * The integration's or connector's id in the workspace. It goes in front
   * of every listed tool's name, as {@link listedToolName} shows.
   */
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
   * The names of every other tool offered to the model in the same turn, as
   * the model sees them: the host's own tools and the tools of every other
   * source, listed ones with their source's id in front.
   */
  readonly otherNames: ReadonlySet<string>;
  /**
   * The trust grant for the source's workspace, or `null` when it isn't
   * trusted. Required, so a caller can't forget it. Without a grant,
   * `workspaceRisks` is ignored and every listed tool is `write`
   * (requirement `ports.connector-trust-enforcement`).
   */
  readonly trust: TrustGrant | null;
  /**
   * The risk the workspace sets for a listed tool, by the name the server
   * lists it under, without the source's id. Used only with a grant. Build
   * it from the connector's file with {@link workspaceRisksOf}.
   */
  readonly workspaceRisks?: ReadonlyMap<string, ToolRisk>;
}

/**
 * The risks a connector's file sets for its tools: `read` for each tool its
 * `tools.read` list marks (`marksRead`, so not one `approve` names). Only
 * the file, which a person wrote, is read: nothing a server lists can add
 * a tool here.
 *
 * @example
 * workspaceRisksOf({ approve: [], read: ["search_issues"] });
 * // Map { "search_issues" => "read" }
 */
export function workspaceRisksOf(
  tools: Pick<Connector["tools"], "approve" | "read">,
): ReadonlyMap<string, ToolRisk> {
  const marked = (tools.read ?? []).filter((name) => marksRead(tools, name));
  return new Map(marked.map((name) => [name, "read"]));
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
  /** The name the model sees and calls: the source's id, `__`, then {@link listedName}. */
  readonly name: string;
  /**
   * The name as the server listed it, which the engine sends the call to the
   * source under. It passed the name rule, so it is safe to send unfenced.
   * Route a call by the offered tool, never by splitting `name` on `__`:
   * a source's id can itself hold `_`.
   */
  readonly listedName: string;
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
  /**
   * The name as the server listed it, without the source's id, cut to 64
   * characters and escaped like text in a reason. Left out when the whole
   * listing is refused.
   */
  readonly name?: string;
  /**
   * `tool` when the whole tool was left out, `keyword` when only part of its
   * parameters was, and `listing` when the whole listing was, because it
   * isn't a list or returns too many tools.
   */
  readonly refused: "tool" | "keyword" | "listing";
  /** Why. Text from the listing in it is cut to 64 characters and escaped. */
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
 * is checked, rebuilt, named with the source's id in front and marked as
 * untrusted, or refused. A listing of more
 * than 128 tools gets one refusal, and none of its listed tools is offered.
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
  const refuseListing = (reason: string) => {
    refusals.push({ source: input.source, refused: "listing", reason });
  };
  // The type says list, but a hostile source decides what `listTools` returns.
  const listed: unknown = input.listed;
  if (!Array.isArray(listed)) {
    refuseListing("the listing isn't a list of tools");
    return { tools, refusals };
  }
  const declared = new Map(input.declared.map((tool) => [tool.name, tool]));
  const timesListed = countNames(input.listed);
  const tooManyTools = input.listed.length > maxListedTools;
  if (tooManyTools) {
    refuseListing(
      `the listing returns ${input.listed.length} tools, more than ${maxListedTools}, so none of its listed tools is offered`,
    );
  }

  for (const entry of input.listed) {
    const declaredTool = declaredToolFor(entry, declared);
    if (declaredTool !== undefined) {
      if (!tools.some((tool) => tool.name === declaredTool.name)) {
        tools.push(offerDeclared(declaredTool));
      }
    } else if (!tooManyTools) {
      // A listing over the cap is refused whole above, so its listed tools aren't read.
      const offer = offerListed(entry, input, timesListed, refuse);
      if (offer !== undefined) {
        tools.push(offer);
      }
    }
  }
  return { tools, refusals };
}

/** The declared tool a listed entry names, if any. */
function declaredToolFor(
  entry: ConnectorTool,
  declared: ReadonlyMap<string, IntegrationTool>,
): IntegrationTool | undefined {
  const name: unknown = isJsonObject(entry) ? entry["name"] : undefined;
  return typeof name === "string" ? declared.get(name) : undefined;
}

type Refuse = (name: unknown, refused: ToolRefusal["refused"], reason: string) => void;

/** Checks one listed tool against every rule. @returns the tool to offer, or `undefined` once it is refused */
function offerListed(
  entry: ConnectorTool,
  input: ToolListingInput,
  timesListed: ReadonlyMap<string, number>,
  refuse: Refuse,
): OfferedListedTool | undefined {
  if (!isJsonObject(entry)) {
    refuse(undefined, "tool", "the listing holds an entry that isn't a tool");
    return undefined;
  }
  const name: unknown = entry["name"];
  if (typeof name === "string" && (timesListed.get(name) ?? 0) > 1) {
    refuse(name, "tool", "the listing returns this name more than once");
    return undefined;
  }
  const reading = readListedTool(entry);
  if (reading.kind === "refused") {
    refuse(name, "tool", reading.reason);
    return undefined;
  }
  // The name rule, the clash check and the cap all look at the name the model sees.
  const finalName = listedToolName(input.source, reading.name);
  if (!passesNameRule(finalName)) {
    refuse(name, "tool", "its name breaks the name rule once the source's id is in front");
    return undefined;
  }
  if (input.otherNames.has(finalName)) {
    refuse(name, "tool", "another tool offered to the model has this name");
    return undefined;
  }
  // Checked against every declared name, not the tools offered so far, so
  // the order of the listing can't let a listed tool take a declared name.
  if (input.declared.some((tool) => tool.name === finalName)) {
    refuse(name, "tool", "a tool this source declares has this name");
    return undefined;
  }
  if (unfencedLength(finalName, reading.parameters) > maxUnfencedLength) {
    const reason = `its names and enum strings add up to more than ${maxUnfencedLength} characters`;
    refuse(name, "tool", reason);
    return undefined;
  }
  for (const path of reading.dropped) {
    refuse(name, "keyword", `dropped the keyword at ${path}`);
  }
  return {
    kind: "listed",
    name: finalName,
    listedName: reading.name,
    description: reading.description,
    parameters: reading.parameters,
    risk: listedRisk(entry, reading.name, input),
    untrusted: true,
  };
}

/**
 * The name the model sees for a listed tool: the source's id, `__`, then the
 * name the server listed. Two sources' tools can't then share a name by
 * accident, and the model can tell which server wrote a tool.
 *
 * @example
 * listedToolName("notes", "lookup"); // => "notes__lookup"
 */
export function listedToolName(source: string, listedName: string): string {
  return `${source}__${listedName}`;
}

/**
 * A listed tool is `write`, or `send` when its listing says so, the same as
 * the engine's `countedRisk`. A trusted workspace can set another risk for a
 * `write` tool, but never for a `send` one: a server can raise its tool's
 * risk, and the workspace's `read` list can't lower `send`.
 *
 * @param entry - as the source returned it; its `risk` may hold anything
 */
function listedRisk(entry: ConnectorTool, name: string, input: ToolListingInput): ToolRisk {
  const { risk }: Record<string, unknown> = { ...entry };
  if (risk === "send") {
    return "send";
  }
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

/**
 * The name a refusal shows: cut and escaped, so control or bidi characters in
 * it can't reorder the integration status. A hostile source can send a name
 * that isn't text; the refusal still needs something to show.
 */
function nameForRefusal(name: unknown): string {
  return typeof name === "string" ? escapeListedText(name) : "(a name that isn't text)";
}
