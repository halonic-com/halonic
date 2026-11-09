import type { ChatMessage, ChatTurnRefusal, ToolCall } from "@halonicjs/ports";
import { checkCallBeforeRun } from "./check-call-before-run.ts";
import { passResultToModel } from "./pass-result-to-model.ts";
import type { TurnLog } from "./turn-log.ts";
import { errorMessage, halonicSource, type TurnTool } from "./turn-tools.ts";

/** What running one call needs from its turn. */
export interface ToolCallContext {
  /** The agent the events name. */
  readonly agent: string;
  readonly log?: TurnLog;
  /** Where a refusal goes. */
  readonly refusals: ChatTurnRefusal[];
}

/**
 * Runs one call to a tool the turn runs itself, and gives the tool message
 * that answers it. A call to a tool nobody offered, or one the check
 * refuses, doesn't run: the model gets the refusal as its result, and the
 * refusal is recorded as data. A tool that throws gives the model the
 * error, and the error is logged as the call's result.
 *
 * @param tool - the offered tool of that name, or `undefined` when there is none
 */
export async function runToolCall(
  context: ToolCallContext,
  tool: TurnTool | undefined,
  call: ToolCall,
): Promise<ChatMessage> {
  if (tool === undefined) {
    // No source offered it, so Halonic is the one refusing.
    return refuseCall(context, halonicSource, call, "no tool of that name was offered");
  }
  const check = checkCallBeforeRun(tool, call);
  if (check.kind === "refused") {
    return refuseCall(context, tool.source, call, check.reason);
  }
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
  });
  return toolMessage(call, passResultToModel(tool, result));
}

/** A tool's text result, and whether the tool answered or threw. */
interface ToolRun {
  readonly result: string;
  readonly outcome: "ok" | "error";
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

function refuseCall(
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
