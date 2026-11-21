import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import type { BridgeAgent } from "@halonicjs/host-harness-host";
import {
  type Harness,
  type HarnessBridgeOptions,
  type HarnessBridgeServer,
  type HarnessTask,
  type KeyOrigins,
  noKeyOrigins,
} from "@halonicjs/ports";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type CliProviderKeysInput, cliProviderKeys } from "./cli-provider-keys.ts";
import {
  acme,
  commitWorkspace,
  fakesFor,
  gitTimeout,
  openEngine,
  runChange,
  setUpRig,
  tearDownRig,
} from "./test/local-harness-host-kit.ts";

// A harness agent whose `model` is an alias of the hub's models (HAL-12488):
// the engine asks the program for the alias's model on every call, so the
// bridge serves the alias's provider's key wherever the agent runs, after the
// built-in loop's key check, and spends it on that model only.

beforeEach(setUpRig);
afterEach(tearDownRig);

const zaiAddress = "https://api.z.ai/api/anthropic";
const stored: Record<string, string> = { "zai-key": "fake-zai-key", "claude-key": "fake-claude" };

/** Z.ai's provider, Anthropic's own, two aliases, and the coder with `model`. */
async function addProviders(model: string): Promise<void> {
  const files: Record<string, string> = {
    "providers/zai.yaml": `id: zai\nname: Z.ai\ntype: anthropic\nbaseUrl: ${zaiAddress}\nsecret: zai-key\n`,
    "providers/claude.yaml": "id: claude\ntype: anthropic\nsecret: claude-key\n",
    "models.yaml": [
      "aliases:",
      "  default:",
      "    provider: mock",
      "    model: echo",
      "  open-coder-agent:",
      "    provider: zai",
      "    model: glm-5.3",
      "    price: { input: 0.6, output: 2.2 }",
      "  careful:",
      "    provider: claude",
      "    model: claude-opus-5-5",
      "",
    ].join("\n"),
    "hubs/lab/agents/coder.agent.yaml": `id: coder\nname: Coder\nharness: claude-code\nmodel: ${model}\ninstructions: Write the change.\n`,
  };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(acme, path)), { recursive: true });
    await writeFile(join(acme, path), text);
  }
}

/** The keys over the lab on disk; `asked` gets each secret the bridge reads. */
async function keysOf(overrides: Partial<CliProviderKeysInput> = {}) {
  const workspace = await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
  const asked: string[] = [];
  const keys = cliProviderKeys({
    workspace: () => workspace,
    secrets: {
      get: async (name) => {
        asked.push(name);
        return stored[name] ?? null;
      },
    },
    keyOrigins: noKeyOrigins,
    trusted: true,
    ...overrides,
  });
  return { keys, asked };
}

const coder = (model: string, runsOn: BridgeAgent["runsOn"] = "this-computer"): BridgeAgent => ({
  runId: "01JD8Q",
  agentId: "coder",
  harness: "claude-code",
  hubId: "lab",
  model,
  runsOn,
});

verifies("cli.harness-provider-key", () => {
  it("serves an alias's key on this computer, at its baseUrl, for its model only, with its price", async () => {
    await addProviders("open-coder-agent");
    const { keys } = await keysOf();

    const services = await keys.servicesFor(coder("open-coder-agent"));

    expect(services.providers.anthropic).toEqual({
      kind: "key",
      secret: "zai-key",
      providerId: "zai",
      baseUrl: zaiAddress,
      models: ["glm-5.3"],
    });
    expect(services.prices).toEqual({ anthropic: { "glm-5.3": { input: 0.6, output: 2.2 } } });
    expect(await keys.models.providerModelOf("lab", "open-coder-agent")).toBe("glm-5.3");
  });

  it("pins an alias's model at the type's own host too", async () => {
    await addProviders("careful");
    const { keys } = await keysOf();

    const services = await keys.servicesFor(coder("careful", "sandbox"));

    expect(services.providers.anthropic).toEqual({
      kind: "key",
      secret: "claude-key",
      providerId: "claude",
      models: ["claude-opus-5-5"],
    });
  });

  it("keeps the program's own sign-in on this computer for a provider/model name", async () => {
    await addProviders("claude/claude-opus-5-5");
    const { keys, asked } = await keysOf();

    const services = await keys.servicesFor(coder("claude/claude-opus-5-5"));

    expect(services.providers.anthropic).toEqual({ kind: "sign-in" });
    expect(await keys.models.providerModelOf("lab", "claude/claude-opus-5-5")).toBeUndefined();
    expect(asked).toEqual([]);
  });

  it("refuses an alias before reading its key when the key may not go to its address", async () => {
    await addProviders("open-coder-agent");
    const listed: KeyOrigins = { allowedOrigins: async () => ["https://api.deepseek.com"] };

    for (const overrides of [{ trusted: false }, { keyOrigins: listed }]) {
      const { keys, asked } = await keysOf(overrides);

      await expect(keys.servicesFor(coder("open-coder-agent"))).rejects.toMatchObject({
        kind: "denied",
      });
      expect(asked).toEqual([]);
    }
  });

  it("refuses an alias whose provider the harness can't call, before reading its key", async () => {
    await addProviders("open-coder-agent");
    const { keys, asked } = await keysOf();

    await expect(
      keys.servicesFor({ ...coder("open-coder-agent"), harness: "codex" }),
    ).rejects.toMatchObject({ code: "not-for-harness" });
    expect(asked).toEqual([]);
  });

  it("gives the bridge the alias of the version the program's model was read from", async () => {
    await addProviders("open-coder-agent");
    const before = await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
    const modelsFile = join(acme, "models.yaml");
    await writeFile(modelsFile, (await readFile(modelsFile, "utf8")).replace("glm-5.3", "glm-5.4"));
    const after = await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
    const versions: LoadedWorkspace[] = [before, after];
    const { keys } = await keysOf({ workspace: () => versions.shift() ?? after });

    const programModel = await keys.models.providerModelOf("lab", "open-coder-agent");
    const services = await keys.servicesFor(coder("open-coder-agent"));

    expect(programModel).toBe("glm-5.3");
    expect(services.providers.anthropic).toMatchObject({ kind: "key", models: ["glm-5.3"] });
  });

  it(
    "reaches the bridge and the program through the CLI's engine",
    async () => {
      await addProviders("open-coder-agent");
      const version = await commitWorkspace();
      const opened: HarnessBridgeOptions[] = [];
      const tasks: HarnessTask[] = [];
      const fakes = fakesFor({ onStart: async () => {} });
      const bridgeServer = fakes.parts.bridgeServer;
      const harness = fakes.parts.harnesses?.["claude-code"];
      if (bridgeServer === undefined || harness === undefined) throw new Error("No fakes.");
      const recordingServer: HarnessBridgeServer = {
        open: (options) => {
          opened.push(options);
          return bridgeServer.open(options);
        },
      };
      const recordingHarness: Harness = {
        ...harness,
        start: (task, session, bridge) => {
          tasks.push(task);
          return harness.start(task, session, bridge);
        },
      };
      const parts = {
        ...fakes.parts,
        bridgeServer: recordingServer,
        harnesses: { "claude-code": recordingHarness },
      };
      const engine = await openEngine({ ...fakes, parts }, contractGrant, true, {
        secrets: { get: async (name) => stored[name] ?? null },
      });

      const { summary } = await runChange(engine, version);

      expect(summary).toMatchObject({ status: "completed" });
      expect(opened.map((options) => options.providers.anthropic)).toEqual([
        {
          kind: "key",
          secret: "zai-key",
          providerId: "zai",
          baseUrl: zaiAddress,
          models: ["glm-5.3"],
        },
      ]);
      expect(opened[0]?.price("anthropic", "glm-5.3")).toEqual({ input: 0.6, output: 2.2 });
      expect(tasks.map(({ model, modelForEveryCall }) => ({ model, modelForEveryCall }))).toEqual([
        { model: "glm-5.3", modelForEveryCall: true },
      ]);
    },
    gitTimeout,
  );
});
