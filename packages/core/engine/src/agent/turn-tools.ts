// Builds the tools a turn offers the model, in the order the port names:
// the caller's, Halonic's own, then each connected server's listing. The
// first tool with a name wins, so a server can't take over a name the
// caller or Halonic already uses.

import type { Connector } from "@halonicjs/format";
import type { ChatTurnRefusal, ConnectorClient, ToolDefinition, ToolRisk } from "@halonicjs/ports";
import { offerListedTools } from "./offer-listed-tools.ts";
import type { TurnAnswer, TurnStop } from "./turn-approval.ts";

/** The source id of Halonic's own tools in refusals. */
export const halonicSource = "halonic";
/** The source id of the caller's tools in refusals. */
export const callerSource = "caller";

/** One of Halonic's own tools, which the turn runs itself. */
export interface HalonicTool {
  /** What the model is offered. */
  readonly definition: ToolDefinition;
  /**
   * What a call can do, for the check a run makes before it runs a call.
   * Left out, the tool reaches only what the agent's file grants it (its
   * notes, its hub's runs, its collections), so a run counts it as `read`
   * and runs its calls without a person's OK.
   */
  readonly risk?: ToolRisk;
  /**
   * Runs the tool and returns its text result.
   *
   * @throws when the tool fails; the model gets the error as the call's result
   */
  run(args: Record<string, unknown>): Promise<string>;
  /**
   * Set on a `delegate_*` tool: runs it as `run` does, except that when the
   * subagent's own turn stops, the stop comes back instead of an answer, so
   * the delegating turn stops at this call too. The turn calls it instead
   * of `run` when it is set.
   *
   * @throws as `run` does
   */
  runOrStop?(args: Record<string, unknown>): Promise<string | SubagentStopped>;
  /**
   * Set on a `delegate_*` tool: goes on in the subagent `agent`, whose turn
   * stopped inside a call of this tool with `args`, from `answer.resume`.
   * It gives the subagent's answer, or where it stopped again.
   *
   * @throws as `run` does, and when `agent` isn't the subagent this tool delegates to
   */
  goOn?(
    args: Record<string, unknown>,
    agent: string,
    answer: TurnAnswer,
  ): Promise<string | SubagentStopped>;
}

/** A subagent's turn stopped inside a `delegate_*` call, and where. */
export interface SubagentStopped {
  readonly kind: "subagent-stopped";
  /** The subagent's id. */
  readonly agent: string;
  readonly stop: TurnStop;
}

/** A tool as the turn offers it, with what it needs to run it. */
export type TurnTool =
  /** The caller's tool: the turn hands calls to it back instead of running them. */
  | { readonly kind: "caller"; readonly source: string; readonly definition: ToolDefinition }
  | {
      readonly kind: "halonic";
      readonly source: string;
      readonly definition: ToolDefinition;
      readonly tool: HalonicTool;
    }
  | {
      readonly kind: "server";
      /** The connector's id. */
      readonly source: string;
      readonly definition: ToolDefinition;
      /** The name the server listed it under, which the call goes to. */
      readonly listedName: string;
      readonly connector: ConnectorClient;
      /**
       * What the engine counts a call to it as doing, which decides whether a
       * person is asked and whether the engine records the call first. `read`
       * only when the connector file's `read` list names it: its server can't
       * lower it (`countedRisk`).
       */
      readonly risk: ToolRisk;
      /** Set when it counts as `read` because the connector file's `read` list names it. */
      readonly markedRead?: true;
      /** What calling it can do, as its listing says, only for the log; absent when the listing doesn't say. */
      readonly listedRisk?: ToolRisk;
    };

/** The tools of one turn and what was refused while building them. */
export interface TurnTools {
  /** In the order they are offered. */
  readonly tools: readonly TurnTool[];
  readonly byName: ReadonlyMap<string, TurnTool>;
  readonly refusals: readonly ChatTurnRefusal[];
}

/** Where a turn's tools come from. */
export interface TurnToolSources {
  readonly callerTools: readonly ToolDefinition[];
  readonly halonicTools: readonly HalonicTool[];
  readonly connectors: readonly ConnectorClient[];
  /**
   * The `tools` lists of the connectors' files, by connector id: a tool the
   * `read` list of its connector's file names counts as reading. A run
   * passes its kept definitions' lists; a chat passes none.
   */
  readonly connectorTools?: Readonly<Record<string, Pick<Connector["tools"], "approve" | "read">>>;
}

/**
 * Builds a turn's tools. A connector whose listing fails is left out with a
 * `listing` refusal, so one broken server doesn't break the chat. A tool
 * whose name an earlier tool already has is refused, naming both sources.
 */
export async function collectTurnTools(sources: TurnToolSources): Promise<TurnTools> {
  const builder = new ToolListBuilder();
  for (const definition of sources.callerTools) {
    builder.add({ kind: "caller", source: callerSource, definition });
  }
  for (const tool of sources.halonicTools) {
    builder.add({ kind: "halonic", source: halonicSource, definition: tool.definition, tool });
  }
  for (const connector of sources.connectors) {
    const lists = sources.connectorTools;
    await addConnectorTools(
      builder,
      connector,
      lists !== undefined && Object.hasOwn(lists, connector.id) ? lists[connector.id] : undefined,
    );
  }
  return builder.result();
}

async function addConnectorTools(
  builder: ToolListBuilder,
  connector: ConnectorClient,
  lists: Pick<Connector["tools"], "approve" | "read"> | undefined,
) {
  let listed: Awaited<ReturnType<ConnectorClient["listTools"]>>;
  try {
    listed = await connector.listTools();
  } catch (error) {
    builder.refuse({
      source: connector.id,
      refused: "listing",
      reason: `couldn't list its tools: ${shortText(errorMessage(error))}`,
    });
    return;
  }
  const offer = offerListedTools({
    source: connector.id,
    listed,
    otherNames: builder.names(),
    ...(lists === undefined ? {} : { lists }),
  });
  for (const refusal of offer.refusals) {
    builder.refuse(refusal);
  }
  for (const tool of offer.tools) {
    builder.add({
      kind: "server",
      source: connector.id,
      definition: tool.definition,
      listedName: tool.listedName,
      connector,
      risk: tool.risk,
      ...(tool.markedRead === undefined ? {} : { markedRead: tool.markedRead }),
      ...(tool.listedRisk === undefined ? {} : { listedRisk: tool.listedRisk }),
    });
  }
}

class ToolListBuilder {
  private readonly tools: TurnTool[] = [];
  private readonly byName = new Map<string, TurnTool>();
  private readonly refusals: ChatTurnRefusal[] = [];

  add(tool: TurnTool): void {
    const name = tool.definition.name;
    const first = this.byName.get(name);
    if (first !== undefined) {
      this.refuse({
        source: tool.source,
        name: shortText(name),
        refused: "tool",
        reason: `${tool.source} offers a tool named ${JSON.stringify(shortText(name))}, which ${first.source} already offers`,
      });
      return;
    }
    this.tools.push(tool);
    this.byName.set(name, tool);
  }

  refuse(refusal: ChatTurnRefusal): void {
    this.refusals.push(refusal);
  }

  names(): ReadonlySet<string> {
    return new Set(this.byName.keys());
  }

  result(): TurnTools {
    return { tools: this.tools, byName: this.byName, refusals: this.refusals };
  }
}

/** The message of a thrown value, which needn't be an `Error`. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// A server wrote names and error texts, so a refusal keeps only the start of them.
const maxRefusalText = 200;

function shortText(text: string): string {
  return text.length > maxRefusalText ? `${text.slice(0, maxRefusalText)}…` : text;
}
