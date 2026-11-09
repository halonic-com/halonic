import type { ChatResponse, Clock, ConnectorClient, ToolDefinition } from "@halonicjs/ports";
import { ScriptedModel } from "../testing/scripted-model.ts";
import { type ModelTurnInput, runModelTurn } from "./run-model-turn.ts";
import type { TurnEvent, TurnLog } from "./turn-log.ts";
import type { HalonicTool } from "./turn-tools.ts";

/** A clock that starts at a fixed time and moves 250 ms on each reading. */
export function steppingClock(): Clock {
  let now = Date.parse("2026-01-05T09:00:00.000Z");
  return {
    now: () => {
      const reading = new Date(now);
      now += 250;
      return reading;
    },
  };
}

/** A run log that keeps the events in memory. */
export class MemoryTurnLog implements TurnLog {
  readonly events: TurnEvent[] = [];

  async append(event: TurnEvent): Promise<void> {
    this.events.push(event);
  }
}

/** A caller tool, which the turn hands back. */
export function callerTool(name: string): ToolDefinition {
  return { name, description: `Picks with ${name}`, parameters: { type: "object" } };
}

/** A Halonic tool that answers with a function. */
export function halonicTool(name: string, run: HalonicTool["run"]): HalonicTool {
  return { definition: { name, description: `Halonic ${name}`, parameters: {} }, run };
}

/** What a test turn starts from. */
export interface TestTurn {
  answers: ChatResponse[];
  callerTools?: ToolDefinition[];
  halonicTools?: HalonicTool[];
  connectors?: ConnectorClient[];
  maxRounds?: number;
  log?: TurnLog;
}

/** Runs a turn on the scripted model with a fixed clock, and gives the model back too. */
export async function runTestTurn(setup: TestTurn) {
  const model = new ScriptedModel(setup.answers);
  const input: ModelTurnInput = {
    provider: model,
    model: "scripted-1",
    messages: [{ role: "user", content: "Find the Acme invoice" }],
    callerTools: setup.callerTools ?? [],
    halonicTools: setup.halonicTools ?? [],
    connectors: setup.connectors ?? [],
    maxRounds: setup.maxRounds ?? 20,
    agent: "clerk",
    clock: steppingClock(),
    ...(setup.log === undefined ? {} : { log: setup.log }),
  };
  const result = await runModelTurn(input);
  return { model, result };
}
