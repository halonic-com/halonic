import type { ChatMessage, ChatTurnRefusal, ToolCall, ToolRisk } from "@halonicjs/ports";
import type { CallChecker } from "./check-call-before-run.ts";
import { passResultToModel } from "./pass-result-to-model.ts";
import type { TurnLog } from "./turn-log.ts";
import { errorMessage, halonicSource, type TurnTool, type TurnTools } from "./turn-tools.ts";

/** What running one call needs from its turn. */
export interface ToolCallContext {
  /** The agent the events name. */
  readonly agent: string;
  readonly log?: TurnLog;
  /** Where a refusal goes. */
  readonly refusals: ChatTurnRefusal[];
  /** Checks each call before it runs. */
  readonly check: CallChecker;
  /**
   * Set in a run: a connector call that can change things isn't made in
   * the turn. The turn checks sending, then stops before the call, and the
   * engine makes it once it has recorded it. Absent in a chat turn.
   */
  readonly effects?: EffectBoundary;
}

/** Where a run's turn hands over a connector call that can change things. */
export interface EffectBoundary {
  /**
   * Whether the connector may run its tools labelled `send`. A refusal's
   * reason goes to the model as the call's result; it never holds a store error.
   */
  checkSending(connector: string): Promise<SendingVerdict>;
}

/** Whether a connector may send, as the model may read it. */
export type SendingVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

/**
 * What became of one call: the tool message that answers it, or a stop
 * before it, for a person's OK or for the engine to make it.
 */
export type CallStep =
  | { readonly kind: "answered"; readonly message: ChatMessage }
  /** The check asks a person first; the turn stops before this call. */
  | { readonly kind: "ask" }
  /** The call changes things on the connector `connector`; the engine makes it. */
  | { readonly kind: "effect"; readonly connector: string };

/**
 * Checks one call to a tool the turn runs itself, and runs it. A call to a
 * tool nobody offered, or one the check refuses, doesn't run: the model
 * gets the refusal as its result, and the refusal is recorded as data. A
 * call the check asks a person about doesn't run either; the turn stops.
 *
 * @param tool - the offered tool of that name, or `undefined` when there is none
 */
export async function runToolCall(
  context: ToolCallContext,
  tool: TurnTool | undefined,
  call: ToolCall,
): Promise<CallStep> {
  if (tool === undefined) {
    return answered(refuseUnoffered(context, call));
  }
  const check = context.check(tool, call);
  if (check.kind === "refused") {
    return answered(refuseCall(context, tool.source, call, check.reason));
  }
  if (check.kind === "ask") {
    // A person isn't asked about a send that would be refused anyway.
    return (await refuseUnsent(context, tool, call)) ?? { kind: "ask" };
  }
  return makeOrHandOver(context, tool, call);
}

/**
 * Makes a call the check let through or a person approved. In a run, a
 * connector call that can change things is handed over instead: when its
 * tool is labelled `send` and the connector may not send, the model gets
 * the refusal as data; otherwise the turn stops before it. Sending is
 * checked here even after a person's OK, because it may have been switched
 * off while the run waited.
 */
export async function makeOrHandOver(
  context: ToolCallContext,
  tool: TurnTool,
  call: ToolCall,
): Promise<CallStep> {
  if (context.effects === undefined || tool.kind !== "server" || tool.risk === "read") {
    return answered(await carryOutCall(context, tool, call));
  }
  return (await refuseUnsent(context, tool, call)) ?? { kind: "effect", connector: tool.source };
}

/**
 * In a run, the refusal of a call to a connector's tool labelled `send`
 * when the connector may not send, or `null` when the call may go on.
 */
async function refuseUnsent(
  context: ToolCallContext,
  tool: TurnTool,
  call: ToolCall,
): Promise<CallStep | null> {
  const boundary = context.effects;
  if (boundary === undefined || tool.kind !== "server" || tool.risk !== "send") return null;
  const sending = await boundary.checkSending(tool.source);
  return sending.allowed ? null : answered(refuseCall(context, tool.source, call, sending.reason));
}

/** What became of the calls of one answer. */
export type CallsStep =
  /** Every call the turn runs itself has its answer; the caller's calls are handed back. */
  | { readonly kind: "done"; readonly callerCalls: ToolCall[] }
  /** The turn stops: `waiting` is the call it stopped before, then the calls after it. */
  | { readonly kind: "stop"; readonly at: StopKind; readonly waiting: ToolCall[] };

/** Why a turn stopped before a call: for a person's OK, or for the engine to make it. */
export type StopKind =
  | { readonly type: "approval" }
  | { readonly type: "effect"; readonly connector: string };

/**
 * Runs the calls of one answer in order, adding each answer to `turn`,
 * until a call needs a person's OK. Calls to the caller's tools are
 * collected instead of run. Only a run's turn stops, and it has no caller
 * tools, so no caller call is lost at a stop. A turn stops before a call
 * that needs a person's OK, and before one the engine must make.
 */
export async function runCalls(
  context: ToolCallContext,
  tools: TurnTools,
  calls: readonly ToolCall[],
  turn: ChatMessage[],
): Promise<CallsStep> {
  const callerCalls: ToolCall[] = [];
  for (const [index, call] of calls.entries()) {
    const tool = tools.byName.get(call.name);
    if (tool?.kind === "caller") {
      callerCalls.push(call);
      continue;
    }
    const step = await runToolCall(context, tool, call);
    if (step.kind !== "answered") {
      return { kind: "stop", at: stopKindOf(step), waiting: calls.slice(index) };
    }
    turn.push(step.message);
  }
  return { kind: "done", callerCalls };
}

/** Why the turn stops at a call that wasn't answered. */
export function stopKindOf(step: Exclude<CallStep, { kind: "answered" }>): StopKind {
  return step.kind === "ask" ? { type: "approval" } : { type: "effect", connector: step.connector };
}

/**
 * Runs a call the check already let through, or a person approved, and
 * gives the tool message that answers it. A tool that throws gives the
 * model the error, and the error is logged as the call's result.
 */
export async function carryOutCall(
  context: ToolCallContext,
  tool: TurnTool,
  call: ToolCall,
): Promise<ChatMessage> {
  await context.log?.append({
    type: "tool.called",
    agent: context.agent,
    tool: call.name,
    args: call.arguments,
  });
  const { result, outcome } = await runTool(tool, call);
  await context.log?.append({
    type: "tool.result",
    agent: context.agent,
    tool: call.name,
    result,
    outcome,
    ...riskOf(tool),
  });
  return toolMessage(call, passResultToModel(tool, result));
}

/** The answer to a call to a tool nobody offered, which Halonic refuses. */
export function refuseUnoffered(context: ToolCallContext, call: ToolCall): ChatMessage {
  return refuseCall(context, halonicSource, call, "no tool of that name was offered");
}

/** A tool's text result, and whether the tool answered or threw. */
interface ToolRun {
  readonly result: string;
  readonly outcome: "ok" | "error";
}

/**
 * The `risk` a call's `tool.result` copies from its tool, when the tool has
 * one (requirement `engine.turn-logs-risk`). Only a server's listing says
 * it; Halonic's own tools leave it out, so readers count it as unknown.
 */
function riskOf(tool: TurnTool): { risk?: ToolRisk } {
  return tool.kind === "server" && tool.risk !== undefined ? { risk: tool.risk } : {};
}

async function runTool(tool: TurnTool, call: ToolCall): Promise<ToolRun> {
  try {
    return { result: await startTool(tool, call), outcome: "ok" };
  } catch (error) {
    return { result: `The tool ${call.name} failed: ${errorMessage(error)}`, outcome: "error" };
  }
}

function startTool(tool: TurnTool, call: ToolCall): Promise<string> {
  switch (tool.kind) {
    case "halonic":
      return tool.tool.run(call.arguments);
    case "server":
      return tool.connector.callTool(tool.listedName, call.arguments);
    case "caller":
      // The loop hands caller calls back before it gets here.
      return Promise.reject(new Error("the caller runs its own tools"));
  }
}

/** Records a `call` refusal and gives the model its reason as the call's result. */
export function refuseCall(
  context: ToolCallContext,
  source: string,
  call: ToolCall,
  reason: string,
): ChatMessage {
  context.refusals.push({ source, name: call.name, refused: "call", reason });
  return toolMessage(call, `Refused: ${reason}`);
}

function toolMessage(call: ToolCall, content: string): ChatMessage {
  return { role: "tool", toolCallId: call.id, name: call.name, content };
}

function answered(message: ChatMessage): CallStep {
  return { kind: "answered", message };
}
