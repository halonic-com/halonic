// Step one of three the HAL-803 rules plug into (HAL-998): what a server
// listed becomes the tools the model is offered. It passes the listing
// through unchanged for now, except its risk, which a server can raise but
// never lower; HAL-998 calls `readToolListing` and `toolForModel` from
// `@halonicjs/app` here.

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
  /** What the model is offered. */
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

/** Reads one connector's listing into the tools offered to the model and the refusals. */
export function offerListedTools(input: ListedToolsInput): OfferedListing {
  const tools = input.listed.map((tool) => ({
    definition: { name: tool.name, description: tool.description, parameters: tool.parameters },
    listedName: tool.name,
    risk: countedRisk(tool.risk),
    ...(tool.risk === undefined ? {} : { listedRisk: tool.risk }),
  }));
  return { tools, refusals: [] };
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
