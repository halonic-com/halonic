import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { HarnessAgent, Placement } from "@halonicjs/engine";
import type { BridgeEvent, Secrets } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { beforeEach, expect, it } from "vitest";
import { openStudioHarnessHost } from "./studio-harness-host.ts";

/** An invented key: what the test looks for wherever the host or the run log could see it. */
const key = "sk-ant-acme-not-real-9e4c";

const coder = {
  runId: "run_1",
  agentId: "coder",
  hubId: "support",
  harness: "claude-code",
  file: {},
} as unknown as HarnessAgent;

/** The provider files of each workspace the tests load; a file's name is its id. */
type ProviderFile = { path: string; text: string };
const claude: ProviderFile = {
  path: "providers/claude.yaml",
  text: "id: claude\ntype: anthropic\nsecret: anthropic-key\n",
};
const zai: ProviderFile = {
  path: "providers/zai.yaml",
  text: "id: zai\ntype: anthropic\nsecret: zai-key\nbaseUrl: https://api.zai.acme.test/anthropic\n",
};

/** The secret names the keychain was asked for. */
let asked: string[];
/** The provider files the engine's key check was given, by id. */
let checked: string[];

beforeEach(() => {
  asked = [];
  checked = [];
});

async function workspaceWith(provider: ProviderFile): Promise<LoadedWorkspace> {
  return await loadWorkspace(
    new MemoryDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      [provider.path]: provider.text,
    }),
  );
}

/** A keychain that holds `saved`, and keeps what it was asked for. */
function keychain(saved: Record<string, string>): Secrets {
  return {
    get: async (name) => {
      asked.push(name);
      return saved[name] ?? null;
    },
  };
}

/**
 * An agent host whose bridge opens and then sends `calls`, and that records
 * what the bridge was opened with and Studio's answers.
 */
function fakeHost(calls: unknown[] = []) {
  const opens: unknown[] = [];
  const answers: unknown[] = [];
  const done = Promise.withResolvers<void>();
  const transport: AgentHostTransport = {
    request: async (route, body) => {
      if (route === "GET /v1/harnesses") return { status: 200, body: [] };
      if (route === "GET /v1/sandbox/capabilities") {
        return { status: 200, body: { files: "shared", strength: "os" } };
      }
      if (route === "POST /v1/bridge/answer") {
        answers.push(body);
        if (answers.length === calls.length) done.resolve();
      }
      return { status: 200, body: {} };
    },
    stream: async (_route, body) => {
      opens.push(body);
      return {
        ok: true,
        lines: (async function* () {
          yield { type: "opened", bridge: "b1", url: "http://127.0.0.1:4100", token: "t1" };
          yield* calls;
          if (calls.length > 0) await done.promise;
        })(),
      };
    },
  };
  return { transport, opens, answers };
}

/** Studio's harness host on `host`, for `workspace`, with a keychain that holds `saved`. */
async function harnessHostOn(
  host: ReturnType<typeof fakeHost>,
  workspace: LoadedWorkspace,
  saved: Record<string, string>,
) {
  return await openStudioHarnessHost({
    transport: host.transport,
    location: "/acme",
    definitions: new MemoryDefinitionStore({}),
    digest: { sha256: async () => new Uint8Array(32) },
    clock: { now: () => new Date("2026-11-21T10:00:00.000Z") },
    instructionTrust: { check: async () => ({ kind: "trusted" }) },
    approvalsOf: () => undefined,
    remoteDecisionsOf: () => undefined,
    reportError: () => {},
    workspace: () => workspace,
    secrets: keychain(saved),
    requireKeyMayGo: async (file) => {
      checked.push(file.id);
    },
    aliases: { providerModel: () => undefined, access: async () => undefined },
  });
}

/** Opens the coder's bridge for `runsOn`, and keeps what the run log records. */
async function openBridge(
  host: ReturnType<typeof fakeHost>,
  workspace: LoadedWorkspace,
  saved: Record<string, string>,
  runsOn: Placement = "sandbox",
) {
  const built = await harnessHostOn(host, workspace, saved);
  const recorded: BridgeEvent[] = [];
  const bridge = await built.harnesses.bridges.open(
    coder,
    { record: async (event) => void recorded.push(event) },
    runsOn,
  );
  return { bridge, recorded };
}

verifies("studio.harness-provider-key", () => {
  it("serves a sandboxed agent the key's name, gives the host its value only when it asks, and names the stand-in's provider", async () => {
    const host = fakeHost([
      { type: "call", call: "c1", method: "secrets.get", params: { name: "anthropic-key" } },
    ]);

    const { bridge } = await openBridge(host, await workspaceWith(claude), {
      "anthropic-key": key,
    });
    await waitUntil("Studio to answer the host", () => host.answers.length === 1);

    expect(host.opens).toEqual([
      expect.objectContaining({
        providers: {
          anthropic: { kind: "key", secret: "anthropic-key", providerId: "claude" },
          openai: { kind: "sign-in" },
        },
      }),
    ]);
    expect(JSON.stringify(host.opens)).not.toContain(key);
    expect(bridge.keyProviders).toEqual(["anthropic"]);
    expect(checked).toEqual(["claude"]);
    expect(host.answers).toEqual([{ bridge: "b1", call: "c1", result: key }]);
  });

  it("stops in Studio's words before the bridge opens when the key isn't saved, so the program never starts", async () => {
    const host = fakeHost();

    const failure = await openBridge(host, await workspaceWith(claude), {}).catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({
      message:
        "The secret \"anthropic-key\" that holds provider claude's key isn't saved on this computer, so the sandboxed agent can't call its model. Save it in Settings › Models.",
    });
    expect(errorKindOf(failure)).toBe("invalid_input");
    expect(host.opens).toEqual([]);
  });

  it("says plainly that Studio can't reach a provider's own address yet, without reading its key", async () => {
    const host = fakeHost();

    const failure = await openBridge(host, await workspaceWith(zai), { "zai-key": key }).catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({
      message:
        "Studio can't send a sandboxed agent's calls to provider zai's own address (https://api.zai.acme.test/anthropic) yet, so its key isn't used. Run this workflow with halonic run, or point the agent's model at a provider without its own address.",
    });
    expect(asked).toEqual([]);
    expect(checked).toEqual([]);
    expect(host.opens).toEqual([]);
  });

  it("scrubs a key the bridge read out of a failure before the run log records it", async () => {
    const host = fakeHost([
      {
        type: "call",
        call: "c1",
        method: "recorder.record",
        params: {
          type: "bridge.failed",
          agent: "coder",
          kind: "internal",
          message: `refused ${key}`,
        },
      },
    ]);

    const { recorded } = await openBridge(host, await workspaceWith(claude), {
      "anthropic-key": key,
    });
    await waitUntil("Studio to answer the host", () => host.answers.length === 1);

    expect(recorded).toEqual([expect.objectContaining({ type: "bridge.failed" })]);
    expect(JSON.stringify(recorded)).not.toContain(key);
  });

  it("keeps the program's own sign-in for an agent on this computer, and reads no key", async () => {
    const host = fakeHost();

    const { bridge } = await openBridge(
      host,
      await workspaceWith(claude),
      { "anthropic-key": key },
      "this-computer",
    );

    expect(host.opens).toEqual([
      expect.objectContaining({
        providers: { anthropic: { kind: "sign-in" }, openai: { kind: "sign-in" } },
      }),
    ]);
    expect(bridge).not.toHaveProperty("keyProviders");
    expect(asked).toEqual([]);
  });
});
