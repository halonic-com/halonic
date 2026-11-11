// Step one of three the HAL-803 rules plug into (HAL-998): what a server
// listed becomes the tools the model is offered. Each tool goes through
// `readListedTool` and `toolForModel` from `@halonicjs/app`, so its
// description, and every `description` and `title` in its parameters, reach
// the model only inside the untrusted fence (`ports.untrusted-tool-listings`).
// Its risk is the listing's, which a server can raise but never lower. The
// tool keeps the name the server listed; naming it after its source is left
// to HAL-998.

import {
  escapeListedText,
  type KeptListedTool,
  readListedTool,
  toolForModel,
} from "@halonicjs/app";
import type { ChatTurnRefusal, ConnectorTool, ToolDefinition, ToolRisk } from "@halonicjs/ports";

/** One connector's listing, and the names already offered in the same turn. */
export interface ListedToolsInput {
  /** The connector's id. */
  readonly source: string;
  /** What its `listTools` returned. */
  readonly listed: readonly ConnectorTool[];
  /** The names of the tools offered before this listing, as the model sees them. */
  readonly otherNames: ReadonlySet<string>;
}

/** A listed tool to offer. */
export interface OfferedListedTool {
  /** What the model is offered, with every text the server wrote fenced. */
  readonly definition: ToolDefinition;
  /** The name the server listed it under, which a call goes to. */
  readonly listedName: string;
  /** What the engine counts a call to it as doing: {@link countedRisk} of its listing's risk. */
  readonly risk: ToolRisk;
  /**
   * What calling it can do, as the listing says; absent when it doesn't say.
   * It only goes into the call's `tool.result` (requirement
   * `engine.turn-logs-risk`); nothing is decided by it.
   */
  readonly listedRisk?: ToolRisk;
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
    tools.push({
      definition: fencedDefinition(read),
      listedName: read.name,
      // The app's `listedRisk` would count `send` as `write` and skip the
      // "allow sending" check, so the risk comes from `countedRisk` (HAL-5199).
      risk: countedRisk(tool.risk),
      ...(tool.risk === undefined ? {} : { listedRisk: tool.risk }),
    });
  }
  return { tools, refusals };
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
 * What the engine counts a call to a connector's tool as doing, given the
 * risk its listing says. The server wrote the listing, so it can raise the
 * risk but never lower it below `write` (requirement
 * `ports.untrusted-tool-listings`): a tool listed as `send` stays `send`, so
 * the "allow sending" check still applies to it, and every other tool,
 * one listed as `read` too, counts as `write`. Only a risk the workspace
 * sets may count a tool as `read`, and a run's definitions don't hold one.
 *
 * @example
 * countedRisk("read"); // "write"
 * countedRisk("send"); // "send"
 * countedRisk(undefined); // "write"
 */
export function countedRisk(listed: ToolRisk | undefined): ToolRisk {
  return listed === "send" ? "send" : "write";
}
