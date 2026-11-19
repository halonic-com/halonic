// Builds the tools a turn offers the model, in the order the port names:
// the caller's, Halonic's own, then each connected server's listing. The
// first tool with a name wins, so a server can't take over a name the
// caller or Halonic already uses.

import type { Connector } from "@halonicjs/format";
import {
  type ChatTurnRefusal,
  type ChatTurnWaiting,
  type ConnectorClient,
  isConnectorToolError,
  type ToolDefinition,
  type ToolRisk,
} from "@halonicjs/ports";
import { approveConnectorListing, type ListedToolApproval } from "./listed-tool-approval.ts";
import { type DeclaredTool, type DeclaredTools, offerListedTools } from "./offer-listed-tools.ts";
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
      /** What calling it can do, as its listing and sheet say, only for the log; absent when neither says. */
      readonly loggedRisk?: ToolRisk;
      /** What one call sends or changes, from the connector's sheet only, for the log. */
      readonly noun?: NonNullable<DeclaredTool["noun"]>;
      /** What one call did to its noun, from the connector's sheet only, for the log. */
      readonly verb?: NonNullable<DeclaredTool["verb"]>;
    };

/** The tools of one turn and what was refused while building them. */
export interface TurnTools {
  /** In the order they are offered. */
  readonly tools: readonly TurnTool[];
  readonly byName: ReadonlyMap<string, TurnTool>;
  readonly refusals: readonly ChatTurnRefusal[];
  /** The listed tools left out because nobody approved them yet; they never go to the model. */
  readonly waiting: readonly ChatTurnWaiting[];
  /**
   * What each connector whose listing failed threw, by connector id, for the
   * engine to read why (`connectorStartFailureOf`). It never goes to the
   * model: its `listing` refusal has the words.
   */
  readonly listingErrors: ReadonlyMap<string, unknown>;
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
  /**
   * The tools the sheets bound to the connectors declare, by connector id and
   * then by the name the server lists a tool under. The host fills it from
   * the sheet a person bound to each source; a connector with no sheet has
   * no entry, and its tools have no noun (requirement `engine.turn-declared-tools`).
   */
  readonly declaredTools?: Readonly<Record<string, DeclaredTools>>;
  /**
   * Which listed tools a person approved. Required: a caller with no
   * approvals passes `noListedToolApproval`, which keeps every listed tool
   * off.
   */
  readonly listedToolApproval: ListedToolApproval;
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
    await addConnectorTools(
      builder,
      connector,
      sources.listedToolApproval,
      forConnector(sources.connectorTools, connector.id),
      forConnector(sources.declaredTools, connector.id),
    );
  }
  return builder.result();
}

async function addConnectorTools(
  builder: ToolListBuilder,
  connector: ConnectorClient,
  approval: ListedToolApproval,
  lists: Pick<Connector["tools"], "approve" | "read"> | undefined,
  declared: DeclaredTools | undefined,
) {
  let listed: Awaited<ReturnType<ConnectorClient["listTools"]>>;
  try {
    listed = await connector.listTools();
  } catch (error) {
    builder.refuseListing(connector.id, error);
    return;
  }
  const approved = await approveConnectorListing(approval, connector.id, listed);
  for (const refusal of approved.refusals) {
    builder.refuse(refusal);
  }
  builder.wait(approved.waiting);
  const offer = offerListedTools({
    source: connector.id,
    listed: approved.listed,
    otherNames: builder.names(),
    ...(lists === undefined ? {} : { lists }),
    ...(declared === undefined ? {} : { declared }),
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
      ...(tool.loggedRisk === undefined ? {} : { loggedRisk: tool.loggedRisk }),
      ...(tool.noun === undefined ? {} : { noun: tool.noun }),
      ...(tool.verb === undefined ? {} : { verb: tool.verb }),
    });
  }
}

/** What a map by connector id holds for one connector, if anything. */
function forConnector<T>(byConnector: Readonly<Record<string, T>> | undefined, id: string) {
  return byConnector !== undefined && Object.hasOwn(byConnector, id) ? byConnector[id] : undefined;
}

class ToolListBuilder {
  private readonly tools: TurnTool[] = [];
  private readonly byName = new Map<string, TurnTool>();
  private readonly refusals: ChatTurnRefusal[] = [];
  private readonly waiting: ChatTurnWaiting[] = [];
  private readonly listingErrors = new Map<string, unknown>();

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

  /** Leaves out a connector whose listing threw `error`, keeping the error for the engine. */
  refuseListing(connector: string, error: unknown): void {
    this.refuse({
      source: connector,
      refused: "listing",
      reason: `couldn't list its tools: ${shortText(errorMessage(error))}`,
    });
    this.listingErrors.set(connector, error);
  }

  wait(waiting: readonly ChatTurnWaiting[]): void {
    this.waiting.push(...waiting);
  }

  names(): ReadonlySet<string> {
    return new Set(this.byName.keys());
  }

  result(): TurnTools {
    return {
      tools: this.tools,
      byName: this.byName,
      refusals: this.refusals,
      waiting: this.waiting,
      listingErrors: this.listingErrors,
    };
  }
}

/** The message of a thrown value, which needn't be an `Error`. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Why a tool call failed, as its result: the error's message, and for a tool
 * that answered with an error of its own (`ConnectorToolError`), the tool's
 * text after it, such as "ENOENT: no such file or directory", so the model
 * and the run log see the cause (HAL-12342). A server wrote that text, so it
 * goes to the model only inside the untrusted fence, as any of its results.
 */
export function toolErrorText(error: unknown): string {
  if (!isConnectorToolError(error)) return errorMessage(error);
  const said = error.toolText.trim();
  return said === "" ? error.message : `${error.message} It said: ${said}`;
}

// A server wrote names and error texts, so a refusal keeps only the start of them.
const maxRefusalText = 200;

function shortText(text: string): string {
  return text.length > maxRefusalText ? `${text.slice(0, maxRefusalText)}…` : text;
}
