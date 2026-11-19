import { ModelCallError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ScriptedModel, textAnswer } from "../testing/scripted-model.ts";
import { reviewedTools } from "./listed-tool-approval.test-helper.ts";
import type { ResolvedModel } from "./model-chain.ts";
import { runModelTurn } from "./run-model-turn.ts";
import {
  MemoryTurnLog,
  runEveryCall,
  secretsWith,
  steppingClock,
} from "./turn-test-kit.test-helper.ts";

/** A model alias on a scripted provider; its model is named after the provider. */
function alias(name: string, provider: ScriptedModel, more: Partial<ResolvedModel> = {}) {
  return { alias: name, provider, model: `${provider.id}-1`, ...more };
}

const offline = () => new ModelCallError("offline", "acme-cloud can't be reached");

function runTurnOn(model: ResolvedModel, log: MemoryTurnLog) {
  return runModelTurn({
    model,
    secrets: secretsWith(),
    messages: [{ role: "user", content: "Find the Acme invoice" }],
    callerTools: [],
    halonicTools: [],
    connectors: [],
    listedToolApproval: reviewedTools,
    maxRounds: 20,
    agent: "clerk",
    clock: steppingClock(),
    checkCall: runEveryCall,
    log,
  });
}

verifies("engine.llm-event-address", () => {
  const local = () => new ScriptedModel([textAnswer("Found it")], "acme-local");

  it("logs the address of a provider on this computer with the request", async () => {
    const log = new MemoryTurnLog();

    await runTurnOn(alias("fast", local(), { address: "localhost:11434" }), log);

    expect(log.events.find((event) => event.type === "llm.request")).toMatchObject({
      alias: "fast",
      address: "localhost:11434",
    });
  });

  it("leaves the address out for a provider with none", async () => {
    const log = new MemoryTurnLog();

    await runTurnOn(alias("fast", local()), log);

    expect(log.events.find((event) => event.type === "llm.request")).not.toHaveProperty("address");
  });

  it("names the model a fallback moved to, with its alias and address", async () => {
    const log = new MemoryTurnLog();
    const smart = new ScriptedModel([offline()], "acme-cloud");
    const model = alias("smart", smart, {
      fallback: [alias("default", local(), { address: "localhost:11434" })],
    });

    await runTurnOn(model, log);

    expect(log.events.find((event) => event.type === "llm.fallback")).toEqual({
      type: "llm.fallback",
      agent: "clerk",
      from: "smart",
      to: "default",
      provider: "acme-local",
      model: "acme-local-1",
      alias: "default",
      address: "localhost:11434",
      error: "offline: acme-cloud can't be reached",
    });
  });

  it("leaves the alias and address out of a fallback to a model with neither", async () => {
    const log = new MemoryTurnLog();
    const smart = new ScriptedModel([offline()], "acme-cloud");
    const { alias: _none, ...unnamed } = alias("default", local());

    await runTurnOn(alias("smart", smart, { fallback: [unnamed] }), log);

    const fallback = log.events.find((event) => event.type === "llm.fallback");
    expect(fallback).toMatchObject({ to: "acme-local/acme-local-1", provider: "acme-local" });
    expect(fallback).not.toHaveProperty("alias");
    expect(fallback).not.toHaveProperty("address");
  });
});
