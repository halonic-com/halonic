// Step one of three the HAL-803 rules plug into (HAL-998): what a server
// listed becomes the tools the model is offered. Each tool goes through
// `readListedTool` and `toolForModel` from `@halonicjs/app`, so its
// description, and every `description` and `title` in its parameters, reach
// the model only inside the untrusted fence (`ports.untrusted-tool-listings`).
// Its risk is the listing's, which a server can raise but never lower, and
// only the connector file's `read` list marks as reading. The tool keeps the
// name the server listed; naming it after its source is left to HAL-998.

import { toolForModel } from "@halonicjs/app";
import { escapeListedText, type KeptListedTool, readListedTool } from "@halonicjs/app/listed-tools";
import { type Connector, type IntegrationTool, marksRead } from "@halonicjs/format";
import type { ChatTurnRefusal, ConnectorTool, ToolDefinition, ToolRisk } from "@halonicjs/ports";

/**
 * What a person's integration sheet declares about one tool: the parts of
 * {@link IntegrationTool} the engine reads. The host picks them out of the
 * sheet it bound to the connector, so only a sheet ever gives a `noun` or a
 * `verb` (requirement `engine.turn-declared-tools`).
 */
export type DeclaredTool = Pick<IntegrationTool, "risk" | "noun" | "verb">;

/** The declared tools of one connector, by the name its server lists them under. */
export type DeclaredTools = Readonly<Record<string, DeclaredTool>>;

/** One connector's listing, and the names already offered in the same turn. */
export interface ListedToolsInput {
  /** The connector's id. */
  readonly source: string;
  /** What its `listTools` returned. */
  readonly listed: readonly ConnectorTool[];
  /** The names of the tools offered before this listing, as the model sees them. */
  readonly otherNames: ReadonlySet<string>;
  /**
   * The `tools` lists of the connector's file, which a person wrote: a tool
   * its `read` list names counts as reading ({@link marksRead}). Absent
   * outside a run, or when the run kept no file for the connector.
   */
  readonly lists?: Pick<Connector["tools"], "approve" | "read">;
  /**
   * What the sheet bound to the connector declares, by the listed name. It
   * can raise a tool's risk and gives its `noun` and `verb`, but never adds
   * a tool: a name the listing lacks is ignored. Absent when no sheet is bound.
   */
  readonly declared?: DeclaredTools;
}

/** A listed tool to offer. */
export interface OfferedListedTool {
  /** What the model is offered, with every text the server wrote fenced. */
  readonly definition: ToolDefinition;
  /** The name the server listed it under, which a call goes to. */
  readonly listedName: string;
  /**
   * What the engine counts a call to it as doing: {@link countedRisk} of its
   * listing's risk, raised to the sheet's when that is higher.
   */
  readonly risk: ToolRisk;
  /** Set when it counts as `read` only because the connector file's `read` list names it. */
  readonly markedRead?: true;
  /**
   * What calling it can do, as the listing and the sheet say, the higher of
   * the two; absent when neither says. It only goes into the call's
   * `tool.result` (requirements `engine.turn-logs-risk` and
   * `engine.turn-declared-tools`); nothing is decided by it.
   */
  readonly loggedRisk?: ToolRisk;
  /** What one call sends or changes, from the sheet only; absent when the sheet has none. */
  readonly noun?: NonNullable<DeclaredTool["noun"]>;
  /** What one call did to its noun, from the sheet only; absent means the reader says "sent". */
  readonly verb?: NonNullable<DeclaredTool["verb"]>;
}

/** What {@link offerListedTools} gives back. */
export interface OfferedListing {
  readonly tools: readonly OfferedListedTool[];
  /** Tools or keywords left out, or the whole listing. They never go to the model. */
  readonly refusals: readonly ChatTurnRefusal[];
}

/**
 * Reads one connector's listing into the tools offered to the model and the
 * refusals. A tool that breaks a rule of `readListedTool` is left out with a
 * `tool` refusal, and each keyword the rebuild of its parameters dropped
 * gets a `keyword` refusal.
 */
export function offerListedTools(input: ListedToolsInput): OfferedListing {
  const tools: OfferedListedTool[] = [];
  const refusals: ChatTurnRefusal[] = [];
  // The type says list, but a hostile server decides what `listTools` returns.
  const listed: unknown = input.listed;
  if (!Array.isArray(listed)) {
    refusals.push({
      source: input.source,
      refused: "listing",
      reason: "the listing isn't a list of tools",
    });
    return { tools, refusals };
  }
  for (const tool of input.listed) {
    const read = readListedTool(tool);
    const name = nameForRefusal(tool?.name);
    if (read.kind === "refused") {
      refusals.push({ source: input.source, name, refused: "tool", reason: read.reason });
      continue;
    }
    for (const path of read.dropped) {
      const reason = `dropped the keyword at ${path}`;
      refusals.push({ source: input.source, name, refused: "keyword", reason });
    }
    tools.push(offeredTool(tool, read, input));
  }
  return { tools, refusals };
}

/** The tool to offer for a kept listing, with its risk counted and what its sheet declares. */
function offeredTool(
  tool: ConnectorTool,
  read: KeptListedTool,
  input: ListedToolsInput,
): OfferedListedTool {
  // The app's `listedRisk` would count `send` as `write` and skip the
  // "allow sending" check, so the risk comes from `countedRisk` (HAL-5199).
  const declared = declaredOf(input.declared, read.name);
  const loggedRisk =
    tool.risk === undefined ? declared?.risk : higherRisk(tool.risk, declared?.risk);
  const risk = higherRisk(
    countedRisk(tool.risk, isMarkedRead(input.lists, read.name)),
    declared?.risk,
  );
  return {
    definition: fencedDefinition(read),
    listedName: read.name,
    risk,
    ...(risk === "read" ? { markedRead: true } : {}),
    ...(loggedRisk === undefined ? {} : { loggedRisk }),
    ...(declared?.noun === undefined ? {} : { noun: declared.noun }),
    ...(declared?.verb === undefined ? {} : { verb: declared.verb }),
  };
}

/**
 * The definition the model gets for a kept tool, from `toolForModel`. It
 * reads only a listed tool's name, description and parameters; the rest is
 * there because its type asks for it.
 */
function fencedDefinition(read: KeptListedTool): ToolDefinition {
  return toolForModel({
    kind: "listed",
    name: read.name,
    listedName: read.name,
    description: read.description,
    parameters: read.parameters,
    risk: "write",
    untrusted: true,
  });
}

/**
 * The name a refusal shows: cut and escaped, as `ports.untrusted-tool-listings`
 * asks. A hostile server can send a name that isn't text.
 */
function nameForRefusal(name: unknown): string {
  return typeof name === "string" ? escapeListedText(name) : "(a name that isn't text)";
}

/**
 * Whether the connector file's `read` list marks the tool a server listed
 * under `name` as reading. Only the file's lists are asked: nothing in the
 * listing, its `risk` included, can add a tool to them.
 */
export function isMarkedRead(
  lists: Pick<Connector["tools"], "approve" | "read"> | undefined,
  name: string,
): boolean {
  return lists !== undefined && marksRead(lists, name);
}

/**
 * What the engine counts a call to a connector's tool as doing, given the
 * risk its listing says. The server wrote the listing, so it can raise the
 * risk but never lower it below `write` (requirement
 * `ports.untrusted-tool-listings`): a tool listed as `send` stays `send`, so
 * the "allow sending" check still applies to it, and every other tool,
 * one listed as `read` too, counts as `write`. Only the workspace counts a
 * tool as `read`, by naming it in the `read` list of the connector's file
 * (`markedRead`), and even then a tool its server lists as `send` stays `send`.
 *
 * @example
 * countedRisk("read", false); // "write"
 * countedRisk(undefined, true); // "read"
 * countedRisk("send", true); // "send"
 */
export function countedRisk(listed: ToolRisk | undefined, markedRead: boolean): ToolRisk {
  if (listed === "send") return "send";
  return markedRead ? "read" : "write";
}

/** The sheet's entry for the tool a server listed under `name`, if the sheet declares it. */
function declaredOf(declared: DeclaredTools | undefined, name: string): DeclaredTool | undefined {
  return declared !== undefined && Object.hasOwn(declared, name) ? declared[name] : undefined;
}

const riskOrder: readonly ToolRisk[] = ["read", "write", "send"];

/** The higher of two risks; a missing `other` leaves `risk` as it is. */
function higherRisk(risk: ToolRisk, other: ToolRisk | undefined): ToolRisk {
  if (other === undefined) return risk;
  return riskOrder.indexOf(risk) >= riskOrder.indexOf(other) ? risk : other;
}
