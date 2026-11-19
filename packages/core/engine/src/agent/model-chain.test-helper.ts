import type { Clock, Secrets } from "@halonicjs/ports";
import type { ScriptedConnector, ScriptedModel } from "../testing/scripted-model.ts";
import { reviewedTools } from "./listed-tool-approval.test-helper.ts";
import type { ResolvedModel } from "./model-chain.ts";
import { runModelTurn } from "./run-model-turn.ts";
import {
  type MemoryTurnLog,
  runEveryCall,
  secretsWith,
  steppingClock,
} from "./turn-test-kit.test-helper.ts";

/** A model alias on a scripted provider; its model is named after the provider. */
export function alias(name: string, provider: ScriptedModel, more: Partial<ResolvedModel> = {}) {
  return { alias: name, provider, model: `${provider.id}-1`, ...more };
}

export interface TurnSetup {
  secrets?: Secrets;
  clock?: Clock;
  log?: MemoryTurnLog;
  connectors?: ScriptedConnector[];
}

/** One turn on the model chain, asking for the Acme invoice. */
export function runTurnOn(model: ResolvedModel, setup: TurnSetup = {}) {
  return runModelTurn({
    model,
    secrets: setup.secrets ?? secretsWith(),
    messages: [{ role: "user", content: "Find the Acme invoice" }],
    callerTools: [],
    halonicTools: [],
    connectors: setup.connectors ?? [],
    listedToolApproval: reviewedTools,
    maxRounds: 20,
    agent: "clerk",
    clock: setup.clock ?? steppingClock(),
    checkCall: runEveryCall,
    ...(setup.log === undefined ? {} : { log: setup.log }),
  });
}
