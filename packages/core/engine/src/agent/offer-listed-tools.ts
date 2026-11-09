// Step one of three the HAL-803 rules plug into (HAL-998): what a server
// listed becomes the tools the model is offered. It passes the listing
// through unchanged for now; HAL-998 calls `readToolListing` and
// `toolForModel` from `@halonicjs/app` here.

import type { ChatTurnRefusal, ConnectorTool, ToolDefinition } from "@halonicjs/ports";

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
  }));
  return { tools, refusals: [] };
}
