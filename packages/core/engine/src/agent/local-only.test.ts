import type { Connector } from "@halonicjs/format";
import { ModelCallError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { LocalExecutor } from "../local-executor.ts";
import { runFailureReasonOf } from "../run/run-failure-reason-of.ts";
import {
  listedTool,
  ScriptedConnector,
  ScriptedModel,
  textAnswer,
} from "../testing/scripted-model.ts";
import type { ResolvedModel } from "./model-chain.ts";
import { runModelTurn } from "./run-model-turn.ts";
import {
  MemoryTurnLog,
  runEveryCall,
  secretsWith,
  steppingClock,
} from "./turn-test-kit.test-helper.ts";

const cloud = () => new ScriptedModel([textAnswer("From the cloud")], "acme-cloud");
const local = () => new ScriptedModel([textAnswer("From this machine")], "acme-local");

/** A model alias on a scripted provider; its model is named after the provider. */
function alias(name: string, provider: ScriptedModel, more: Partial<ResolvedModel> = {}) {
  return { alias: name, provider, model: `${provider.id}-1`, ...more };
}

/**
 * An executor for chat turns on one model, local only unless `localOnly` says otherwise.
 * With `lists`, a chat turn reads its connectors' tool lists from them, as from a workspace's files.
 */
function executorOn(
  model: ResolvedModel,
  connectors: ScriptedConnector[] = [],
  localOnly = true,
  lists?: Readonly<Record<string, Connector["tools"]>>,
): LocalExecutor {
  return new LocalExecutor({
    resolveModel: async () => model,
    halonicTools: [],
    connectors,
    secrets: secretsWith(),
    clock: steppingClock(),
    localOnly,
    ...(lists === undefined ? {} : { chatConnectorToolsOf: async () => lists }),
  });
}

verifies("engine.local-only", () => {
  it("skips a model that isn't local, and the local fallback answers", async () => {
    const smart = cloud();
    const executor = executorOn(
      alias("smart", smart, { fallback: [alias("default", local(), { local: true })] }),
    );

    const response = await executor.chatTurn({ hubId: "acme", messages: [], tools: [] });

    expect(smart.requests).toEqual([]);
    expect(response.content).toBe("From this machine");
    expect(response.skipped).toEqual([
      {
        alias: "smart",
        provider: "acme-cloud",
        model: "acme-cloud-1",
        reason: "local-only",
        next: "default",
      },
    ]);
  });

  it("fails with local-only, calling nothing, when no model is local", async () => {
    const smart = cloud();
    const log = new MemoryTurnLog();

    const failure = await runModelTurn({
      model: alias("smart", smart),
      secrets: secretsWith(),
      messages: [{ role: "user", content: "Find the Acme invoice" }],
      callerTools: [],
      halonicTools: [],
      connectors: [],
      maxRounds: 20,
      agent: "clerk",
      clock: steppingClock(),
      checkCall: runEveryCall,
      log,
      localOnly: true,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ModelCallError);
    expect(failure).toMatchObject({
      reason: "local-only",
      message: "no model is local, and the workspace is local only (tried smart)",
    });
    expect(smart.requests).toEqual([]);
    expect(log.events).toEqual([
      {
        type: "llm.skipped",
        agent: "clerk",
        alias: "smart",
        provider: "acme-cloud",
        model: "acme-cloud-1",
        reason: "local-only",
      },
    ]);
    expect(runFailureReasonOf(failure)).toEqual({ reason: "local-only" });
  });

  it("offers only the tools of local connectors", async () => {
    const model = local();
    const files = Object.assign(new ScriptedConnector("files", [listedTool("read_file")]), {
      local: true,
    });
    const bank = new ScriptedConnector("bank", [listedTool("transfer")]);

    await executorOn(alias("default", model, { local: true }), [files, bank]).chatTurn({
      hubId: "acme",
      messages: [],
      tools: [],
    });

    const offered = model.requests[0]?.tools?.map((tool) => tool.name) ?? [];
    expect(offered.some((name) => name.includes("read_file"))).toBe(true);
    expect(offered.some((name) => name.includes("transfer"))).toBe(false);
  });

  it("offers no connector that isn't local when the workspace's files list its tools", async () => {
    const model = local();
    const files = Object.assign(new ScriptedConnector("files", [listedTool("read_file")]), {
      local: true,
    });
    const bank = new ScriptedConnector("bank", [listedTool("transfer")]);
    const lists = {
      files: { allow: ["read_file"], approve: [] },
      bank: { allow: ["transfer"], approve: [] },
    };

    await executorOn(alias("default", model, { local: true }), [files, bank], true, lists).chatTurn(
      { hubId: "acme", messages: [], tools: [] },
    );

    const offered = model.requests[0]?.tools?.map((tool) => tool.name) ?? [];
    expect(offered.some((name) => name.includes("read_file"))).toBe(true);
    expect(offered.some((name) => name.includes("transfer"))).toBe(false);
  });

  it("changes nothing when the workspace isn't local only", async () => {
    const response = await executorOn(alias("smart", cloud()), [], false).chatTurn({
      hubId: "acme",
      messages: [],
      tools: [],
    });

    expect(response.content).toBe("From the cloud");
    expect(response.skipped).toEqual([]);
  });
});
