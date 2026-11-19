import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type HarnessKeysInput, harnessBridgeKeys } from "./harness-bridge-keys.ts";
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

beforeEach(setUpRig);
afterEach(tearDownRig);

const zaiAddress = "https://api.z.ai/api/anthropic";

/** Adds Z.ai's provider and the `open-coder-agent` alias to the lab, and gives the coder `model`. */
async function addOpenCoder(model: string | undefined): Promise<void> {
  const files: Record<string, string> = {
    "providers/zai.yaml": `id: zai\nname: Z.ai\ntype: anthropic\nbaseUrl: ${zaiAddress}\nsecret: zai-key\n`,
    "models.yaml": [
      "aliases:",
      "  default:",
      "    provider: mock",
      "    model: echo",
      "  open-coder-agent:",
      "    provider: zai",
      "    model: glm-5.3",
      "    price: { input: 0.6, output: 2.2 }",
      "",
    ].join("\n"),
    "hubs/lab/agents/coder.agent.yaml": [
      "id: coder",
      "name: Coder",
      "harness: claude-code",
      ...(model === undefined ? [] : [`model: ${model}`]),
      "instructions: Write the change.",
      "",
    ].join("\n"),
  };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(acme, path)), { recursive: true });
    await writeFile(join(acme, path), text);
  }
}

/** The keys over the lab as it is on disk, with stored keys for Z.ai and one Halonic doesn't give a bridge. */
async function keysOf(overrides: Partial<Omit<HarnessKeysInput, "workspace">> = {}) {
  const workspace: LoadedWorkspace = await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
  const stored: Record<string, string> = {
    "zai-key": "fake-zai-key",
    "other-key": "fake-other-key",
  };
  return harnessBridgeKeys({
    workspace: () => workspace,
    secrets: { get: async (name) => stored[name] ?? null },
    keyOrigins: noKeyOrigins,
    trusted: true,
    ...overrides,
  });
}

const coder = (model?: string) => ({
  runId: "01JD8Q",
  agentId: "coder",
  hubId: "lab",
  ...(model === undefined ? {} : { model }),
});

verifies("cli.harness-bridge-keys", () => {
  describe("what a harness agent's bridge serves", () => {
    it("gives an agent whose model is an alias its provider's key, at its baseUrl, with its price", async () => {
      await addOpenCoder("open-coder-agent");
      const keys = await keysOf();

      const services = await keys.services.servicesFor(coder("open-coder-agent"));

      expect(services.providers).toEqual({
        anthropic: {
          kind: "key",
          secret: "zai-key",
          providerId: "zai",
          baseUrl: zaiAddress,
          model: "glm-5.3",
        },
      });
      expect(services.prices).toEqual({ anthropic: { "glm-5.3": { input: 0.6, output: 2.2 } } });
      expect(await keys.models.providerModelOf("lab", "open-coder-agent")).toBe("glm-5.3");
    });

    it("keeps the program's own sign-in for an agent with no alias", async () => {
      await addOpenCoder("sonnet");
      const keys = await keysOf();
      const signIn = { anthropic: { kind: "sign-in" }, openai: { kind: "sign-in" } };

      expect((await keys.services.servicesFor(coder("sonnet"))).providers).toEqual(signIn);
      expect((await keys.services.servicesFor(coder())).providers).toEqual(signIn);
      expect(await keys.models.providerModelOf("lab", "sonnet")).toBeUndefined();
    });

    it("gives the bridge only a key a bridge was given", async () => {
      await addOpenCoder("open-coder-agent");
      const keys = await keysOf();

      expect(await keys.secrets.get("zai-key")).toBeNull();
      await keys.services.servicesFor(coder("open-coder-agent"));

      expect(await keys.secrets.get("zai-key")).toBe("fake-zai-key");
      expect(await keys.secrets.get("other-key")).toBeNull();
    });

    it("refuses before naming the key when the key may not go to the provider's address", async () => {
      await addOpenCoder("open-coder-agent");
      const listed: KeyOrigins = { allowedOrigins: async () => ["https://api.deepseek.com"] };

      for (const keys of [await keysOf({ trusted: false }), await keysOf({ keyOrigins: listed })]) {
        await expect(keys.services.servicesFor(coder("open-coder-agent"))).rejects.toMatchObject({
          kind: "denied",
        });
        expect(await keys.secrets.get("zai-key")).toBeNull();
      }
    });

    it(
      "reaches the bridge and the program through the CLI's engine",
      async () => {
        await addOpenCoder("open-coder-agent");
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
        const engine = await openEngine({ ...fakes, parts }, contractGrant);

        const { summary } = await runChange(engine, version);

        expect(summary).toMatchObject({ status: "completed" });
        expect(opened.map((options) => options.providers)).toEqual([
          {
            anthropic: {
              kind: "key",
              secret: "zai-key",
              providerId: "zai",
              baseUrl: zaiAddress,
              model: "glm-5.3",
            },
          },
        ]);
        expect(opened[0]?.price("anthropic", "glm-5.3")).toEqual({ input: 0.6, output: 2.2 });
        expect(tasks.map(({ model, modelForEveryCall }) => ({ model, modelForEveryCall }))).toEqual(
          [{ model: "glm-5.3", modelForEveryCall: true }],
        );
      },
      gitTimeout,
    );
  });
});
