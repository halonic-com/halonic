import { type Clock, ModelCallError, type Secrets, VendorErrorText } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { LocalExecutor } from "../local-executor.ts";
import { runFailureReasonOf } from "../run/run-failure-reason-of.ts";
import {
  call,
  callAnswer,
  listedTool,
  ScriptedConnector,
  ScriptedModel,
  textAnswer,
} from "../testing/scripted-model.ts";
import type { ResolvedModel } from "./model-chain.ts";
import { runModelTurn } from "./run-model-turn.ts";
import { MemoryTurnLog, secretsWith, steppingClock } from "./turn-test-kit.test-helper.ts";

/** A model alias on a scripted provider; its model is named after the provider. */
function alias(name: string, provider: ScriptedModel, more: Partial<ResolvedModel> = {}) {
  return { alias: name, provider, model: `${provider.id}-1`, ...more };
}

const offline = () => new ModelCallError("offline", "acme-cloud can't be reached");

interface TurnSetup {
  secrets?: Secrets;
  clock?: Clock;
  log?: MemoryTurnLog;
  connectors?: ScriptedConnector[];
}

function runTurnOn(model: ResolvedModel, setup: TurnSetup = {}) {
  return runModelTurn({
    model,
    secrets: setup.secrets ?? secretsWith(),
    messages: [{ role: "user", content: "Find the Acme invoice" }],
    callerTools: [],
    halonicTools: [],
    connectors: setup.connectors ?? [],
    maxRounds: 20,
    agent: "clerk",
    clock: setup.clock ?? steppingClock(),
    ...(setup.log === undefined ? {} : { log: setup.log }),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

verifies("engine.skip-model-without-key", () => {
  const cloud = () => new ScriptedModel([textAnswer("From the cloud")], "acme-cloud");
  const local = () => new ScriptedModel([textAnswer("From this machine")], "acme-local");

  it("skips a model whose key isn't set and returns the skip when there is no log", async () => {
    const smart = cloud();
    const executor = new LocalExecutor({
      resolveModel: async () =>
        alias("smart", smart, { secret: "acme-cloud-key", fallback: [alias("default", local())] }),
      halonicTools: [],
      connectors: [],
      secrets: secretsWith("another-key"),
      clock: steppingClock(),
    });

    const response = await executor.chatTurn({ hubId: "acme", messages: [], tools: [] });

    expect(smart.requests).toEqual([]);
    expect(response.content).toBe("From this machine");
    expect(response.model).toBe("acme-local-1");
    expect(response.skipped).toEqual([
      {
        alias: "smart",
        provider: "acme-cloud",
        model: "acme-cloud-1",
        reason: "no-key",
        next: "default",
      },
    ]);
  });

  it("logs the skip before the request to the next model", async () => {
    const log = new MemoryTurnLog();
    const model = alias("smart", cloud(), {
      secret: "acme-cloud-key",
      fallback: [alias("default", local())],
    });

    await runTurnOn(model, { log });

    expect(log.events.map((event) => event.type)).toEqual([
      "llm.skipped",
      "llm.request",
      "llm.response",
    ]);
    expect(log.events[0]).toEqual({
      type: "llm.skipped",
      agent: "clerk",
      alias: "smart",
      provider: "acme-cloud",
      model: "acme-cloud-1",
      reason: "no-key",
      next: "default",
    });
    expect(log.events[1]).toMatchObject({ provider: "acme-local", model: "acme-local-1" });
  });

  it("calls a model whose key is set", async () => {
    const smart = cloud();
    const result = await runTurnOn(alias("smart", smart, { secret: "acme-cloud-key" }), {
      secrets: secretsWith("acme-cloud-key"),
    });

    expect(result.content).toBe("From the cloud");
    expect(result.skipped).toEqual([]);
  });

  it("fails with no-key, calling nothing, when no model has its key", async () => {
    const smart = cloud();
    const backup = cloud();
    const log = new MemoryTurnLog();
    const model = alias("smart", smart, {
      secret: "acme-cloud-key",
      fallback: [alias("backup", backup, { secret: "acme-cloud-key" })],
    });

    const failure = await runTurnOn(model, { log }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ModelCallError);
    expect(failure).toMatchObject({
      reason: "no-key",
      message: "no model has its key set (tried smart, backup)",
    });
    expect(smart.requests.length + backup.requests.length).toBe(0);
    expect(log.events.map((event) => event.type)).toEqual(["llm.skipped", "llm.skipped"]);
    expect(log.events[1]).not.toHaveProperty("next");
  });
});

verifies("engine.offline-falls-back", () => {
  it("moves on at once when offline, and no time passes", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-11-09T09:00:00.000Z") });
    const clock: Clock = { now: () => new Date() };
    const log = new MemoryTurnLog();
    const smart = new ScriptedModel([offline()], "acme-cloud");
    const local = new ScriptedModel([textAnswer("From this machine")], "acme-local");

    const result = await runTurnOn(alias("smart", smart, { fallback: [alias("local", local)] }), {
      clock,
      log,
    });

    expect(result.content).toBe("From this machine");
    expect(log.events.map((event) => event.type)).toEqual([
      "llm.request",
      "llm.fallback",
      "llm.response",
    ]);
    expect(log.events[1]).toEqual({
      type: "llm.fallback",
      agent: "clerk",
      from: "smart",
      to: "local",
      error: "offline: acme-cloud can't be reached",
    });
    expect(log.events[2]).toMatchObject({ provider: "acme-local", latencyMs: 0 });
    expect(vi.getTimerCount()).toBe(0);
    expect(Date.now()).toBe(Date.parse("2026-11-09T09:00:00.000Z"));
  });

  it("stays on the fallback for the rest of the turn, so no tool runs twice", async () => {
    const mail = new ScriptedConnector("mail", [listedTool("lookup")]);
    const smart = new ScriptedModel([callAnswer(call("c1", "lookup")), offline()], "acme-cloud");
    const local = new ScriptedModel(
      [callAnswer(call("c2", "lookup")), textAnswer("Found it")],
      "acme-local",
    );

    const result = await runTurnOn(alias("smart", smart, { fallback: [alias("local", local)] }), {
      connectors: [mail],
    });

    expect(result.content).toBe("Found it");
    expect(mail.calls).toHaveLength(2);
    expect(smart.requests).toHaveLength(2);
    expect(local.requests).toHaveLength(2);
  });

  it("tries each alias once, one level deep, and fails naming the cause", async () => {
    const smart = new ScriptedModel([offline(), offline()], "acme-cloud");
    const local = new ScriptedModel([offline()], "acme-local");
    const other = new ScriptedModel([textAnswer("never")], "acme-other");
    const first = alias("smart", smart);
    const model = {
      ...first,
      fallback: [alias("local", local, { fallback: [alias("other", other)] }), first],
    };

    const failure = await runTurnOn(model).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ModelCallError);
    expect(failure).toMatchObject({
      reason: "offline",
      message: "no model reachable (tried smart, local)",
    });
    expect(smart.requests).toHaveLength(1);
    expect(local.requests).toHaveLength(1);
    expect(other.requests).toEqual([]);
    expect(runFailureReasonOf(failure)).toEqual({ reason: "model-unreachable" });
  });

  it("moves on as well when a provider itself says it has no key", async () => {
    const smart = new ScriptedModel(
      [new ModelCallError("no-key", "acme-cloud has no key")],
      "acme-cloud",
    );
    const local = new ScriptedModel([textAnswer("From this machine")], "acme-local");

    const result = await runTurnOn(alias("smart", smart, { fallback: [alias("local", local)] }));

    expect(result.content).toBe("From this machine");
  });

  it("names a model without an alias by its provider and model", async () => {
    const log = new MemoryTurnLog();
    const cloud = new ScriptedModel([offline()], "acme-cloud");
    const local = new ScriptedModel([textAnswer("ok")], "acme-local");

    await runTurnOn(
      { provider: cloud, model: "big", fallback: [{ provider: local, model: "small" }] },
      { log },
    );

    expect(log.events[1]).toMatchObject({ from: "acme-cloud/big", to: "acme-local/small" });
  });
});

verifies("engine.model-failure-stops", () => {
  it.each([
    ["model-no-tools", new ModelCallError("model-no-tools", "acme-local-1 does not support tools")],
    [
      "model-missing",
      new ModelCallError("model-missing", 'acme-local has no model "acme-local-1"'),
    ],
    [
      "key-refused",
      new ModelCallError("key-refused", "acme-local didn't accept the key (HTTP 401)"),
    ],
    [
      "out-of-credit",
      new ModelCallError("out-of-credit", "acme-local refused the call (HTTP 402)"),
    ],
    [
      "provider-busy",
      new ModelCallError("provider-busy", "acme-local refused the call (HTTP 529)"),
    ],
    ["refused", new ModelCallError("refused", "acme-local refused the call (HTTP 400)")],
    ["out-of-memory", new ModelCallError("out-of-memory", "acme-local-1 doesn't fit in memory")],
  ])("stops the turn on %s and tries no fallback", async (reason, error) => {
    const local = new ScriptedModel([error], "acme-local");
    const smart = new ScriptedModel([textAnswer("never")], "acme-cloud");

    const failure = runTurnOn(alias("local", local, { fallback: [alias("smart", smart)] }));

    await expect(failure).rejects.toMatchObject({ reason });
    expect(smart.requests).toEqual([]);
  });

  it("stops the turn on an error that isn't a ModelCallError", async () => {
    const local = new ScriptedModel([new Error("the adapter broke")], "acme-local");
    const smart = new ScriptedModel([textAnswer("never")], "acme-cloud");

    const failure = runTurnOn(alias("local", local, { fallback: [alias("smart", smart)] }));

    await expect(failure).rejects.toThrow("the adapter broke");
    expect(smart.requests).toEqual([]);
  });

  it("gives a run the failure reason of the model call, and error for refused or anything else", () => {
    expect(runFailureReasonOf(new ModelCallError("model-missing", "gone"))).toEqual({
      reason: "model-missing",
    });
    expect(runFailureReasonOf(new ModelCallError("model-no-tools", "no tools"))).toEqual({
      reason: "model-no-tools",
    });
    expect(runFailureReasonOf(new ModelCallError("key-refused", "no"))).toEqual({
      reason: "key-refused",
    });
    expect(runFailureReasonOf(new ModelCallError("refused", "no"))).toEqual({ reason: "error" });
    expect(runFailureReasonOf(new Error("broke"))).toEqual({ reason: "error" });
  });

  it("fails a run whose models were all offline as model-unreachable, naming the last host", async () => {
    const at = (host: string) => new ModelCallError("offline", "didn't answer", { host });
    const local = new ScriptedModel([at("localhost:11434")], "acme-local");
    const smart = new ScriptedModel([at("api.acme.test:443")], "acme-cloud");

    const failure = await runTurnOn(
      alias("local", local, { fallback: [alias("smart", smart)] }),
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({ reason: "offline", host: "api.acme.test:443" });
    expect(runFailureReasonOf(failure)).toEqual({
      reason: "model-unreachable",
      host: "api.acme.test:443",
    });
  });
});

verifies("ports.workspace-secrets", () => {
  it("ends the turn when a model's secret is one of Halonic's own", async () => {
    const smart = new ScriptedModel([textAnswer("From the cloud")], "acme-cloud");

    await expect(
      runTurnOn(alias("smart", smart, { secret: "token_key" }), {
        secrets: secretsWith("token-key", "token_key"),
      }),
    ).rejects.toThrow(new RangeError("A workspace can't pick a secret that belongs to Halonic."));
    expect(smart.requests).toEqual([]);
  });
});

verifies("engine.provider-text", () => {
  it("keeps the provider's text on llm.fallback", async () => {
    const log = new MemoryTurnLog();
    const cause = new VendorErrorText(502, "upstream connect error");
    const proxyDown = new ModelCallError("offline", "acme-cloud can't be reached", { cause });
    const smart = new ScriptedModel([proxyDown], "acme-cloud");
    const local = new ScriptedModel([textAnswer("From this machine")], "acme-local");

    await runTurnOn(alias("smart", smart, { fallback: [alias("local", local)] }), { log });

    expect(log.events[1]).toEqual({
      type: "llm.fallback",
      agent: "clerk",
      from: "smart",
      to: "local",
      error: "offline: acme-cloud can't be reached",
      providerText: { status: 502, text: "upstream connect error" },
    });
  });
});
