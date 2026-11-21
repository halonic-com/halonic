import { readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { join } from "node:path";
import { FileAgentPlacementStore, FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { AgentPlacement, agentFingerprint } from "@halonicjs/app";
import type { RunVersion } from "@halonicjs/events";
import type { ProviderAccessChoice } from "@halonicjs/host-harness-host";
import {
  type HarnessBridge,
  type HttpClient,
  harnessBridgeTokenHeader,
  noKeyOrigins,
  type SandboxProfile,
} from "@halonicjs/ports";
import { placementFolder, profileFolder } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { cliProviderKeys } from "./cli-provider-keys.ts";
import {
  acme,
  commitWorkspace,
  type EngineKeys,
  fakesFor,
  gitTimeout,
  openEngine,
  profile,
  runChange,
  setUpRig,
  tearDownRig,
} from "./test/local-harness-host-kit.ts";
import { webCryptoDigest } from "./workspace-runs.ts";

// The bridge serves a key Halonic keeps to a sandboxed harness agent
// (HAL-12784), through the real engine, the CLI's harness host and its Node
// bridge on its socket. The fake Claude Code calls the bridge as the real
// one would, and a fake Anthropic-compatible endpoint stands in for the provider.

beforeEach(setUpRig);
afterEach(tearDownRig);

/** An invented key: what the test looks for wherever the program or the run log could see it. */
const key = "halonic-test-key-not-real-7f3a";
/** The fake provider's address, on this computer, where a provider file may send a key over plain http. */
const providerAddress = "http://127.0.0.1:47011/anthropic";
const otherAddress = "http://127.0.0.1:47012/anthropic";

/** One call the bridge made to the fake provider. */
interface UpstreamCall {
  readonly url: string;
  readonly headers: Headers;
}

/** A fake provider that answers every call with a short message, or with what `reply` gives. */
function fakeProvider(reply?: () => Response): { calls: UpstreamCall[]; http: HttpClient } {
  const calls: UpstreamCall[] = [];
  const http: HttpClient = {
    fetch: async (url, init) => {
      calls.push({ url: String(url), headers: new Headers(init?.headers) });
      return reply?.() ?? Response.json(message);
    },
  };
  return { calls, http };
}

const message = {
  id: "msg_01",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5-5",
  content: [{ type: "text", text: "Done" }],
  stop_reason: "end_turn",
  usage: { input_tokens: 1_000_000, output_tokens: 0 },
};

/** Writes the workspace's provider files and models, then commits it. */
async function workspaceWith(files: Record<string, string>): Promise<RunVersion> {
  for (const [path, text] of Object.entries(files)) await writeFile(join(acme, path), text);
  return await commitWorkspace();
}

const claudeProvider = `id: claude\ntype: anthropic\nsecret: anthropic-key\nbaseUrl: ${providerAddress}\n`;

/** The coder, with its model at `claude`: the bridge sends calls to a provider's own address only for the agent's model. */
const coderOnClaude =
  "id: coder\nname: Coder\nharness: claude-code\nmodel: claude/claude-sonnet-5-5\ninstructions: Write the change.\n";

/** What the program got back from the bridge. */
interface Reply {
  status: number;
  body: string;
}

/** Calls the bridge as Claude Code does: over its socket, with the run token, and its own placeholder key. */
function callModel(bridge: HarnessBridge): Promise<Reply> {
  const body = JSON.stringify({
    model: "claude-sonnet-5-5",
    max_tokens: 64,
    messages: [{ role: "user", content: "Write the change." }],
  });
  return new Promise((resolve, reject) => {
    const call = request(
      {
        socketPath: bridge.socketPath,
        host: new URL(bridge.url).host,
        path: "/v1/messages",
        method: "POST",
        headers: {
          [harnessBridgeTokenHeader]: bridge.token,
          "content-type": "application/json",
          "x-api-key": "the-programs-own-placeholder",
          authorization: "Bearer the-programs-own-sign-in",
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (text += chunk));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body: text }));
        response.on("error", () => resolve({ status: response.statusCode ?? 0, body: text }));
      },
    );
    call.on("error", reject);
    call.end(body);
  });
}

/** Every file under `path` (itself, when it is a file); nothing when it doesn't exist. */
async function filesUnder(path: string): Promise<string[]> {
  const found = await stat(path).catch(() => undefined);
  if (found === undefined) return [];
  if (!found.isDirectory()) return [path];
  const entries = await readdir(path, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

/** The files the program may read, per its sandbox profile, whose text holds `value`. */
async function readableFilesHolding(given: SandboxProfile, value: string): Promise<string[]> {
  const folders = [
    given.workingFolder,
    given.tempFolder,
    given.settingsFolder,
    ...given.readOnlyPaths,
  ];
  const holding: string[] = [];
  for (const folder of folders) {
    if (folder === null) continue;
    for (const file of await filesUnder(folder)) {
      if ((await readFile(file, "utf8")).includes(value)) holding.push(file);
    }
  }
  return holding;
}

/** Runs Change with the coder calling its model once, and gives what each side saw. */
async function runWithModelCall(version: RunVersion, keys: EngineKeys) {
  const replies: Reply[] = [];
  const seen: { profile?: SandboxProfile; filesWithKey?: string[] } = {};
  const fakes = fakesFor(
    {
      onStart: async (given, bridge) => {
        seen.profile = given;
        if (bridge !== undefined) replies.push(await callModel(bridge));
        // Looked at while the program runs, when its folders are as it sees them.
        seen.filesWithKey = await readableFilesHolding(given, key);
      },
    },
    { bridge: "node" },
  );
  const engine = await openEngine(fakes, contractGrant, true, keys);
  const { runId, summary } = await runChange(engine, version);
  const log = JSON.stringify(await engine.runs.events(runId));
  return { fakes, replies, profile: seen.profile, filesWithKey: seen.filesWithKey, summary, log };
}

/**
 * The fake program reaches the bridge on its Unix socket, as on Linux. Windows
 * has none, and the CLI doesn't run harness agents there yet, so the tests that
 * call the bridge run on Linux and macOS only.
 */
const noUnixSockets = process.platform === "win32";

const savedKey = { get: async (name: string) => (name === "anthropic-key" ? key : null) };

verifies("cli.harness-provider-key", () => {
  it.skipIf(noUnixSockets)(
    "[platform:win32] no Unix socket for the bridge: calls a sandboxed agent's model with the key Halonic keeps, which the program never sees",
    async () => {
      const version = await workspaceWith({
        "providers/claude.yaml": claudeProvider,
        "hubs/lab/agents/coder.agent.yaml": coderOnClaude,
      });
      const provider = fakeProvider();
      const told: ProviderAccessChoice[] = [];

      const {
        fakes,
        replies,
        profile: given,
        filesWithKey,
        log,
      } = await runWithModelCall(version, {
        secrets: savedKey,
        http: provider.http,
        reportAccess: (_agent, choice) => told.push(choice),
      });

      expect(replies).toEqual([expect.objectContaining({ status: 200 })]);
      expect(provider.calls).toHaveLength(1);
      expect(provider.calls[0]?.headers.get("x-api-key")).toBe(key);
      // The program's own sign-in doesn't go on with a key.
      expect(provider.calls[0]?.headers.get("authorization")).toBeNull();
      // The program's environment and arguments hold the bridge's stand-in, never the key.
      expect(JSON.stringify(given)).not.toContain(key);
      expect(JSON.stringify(given?.env)).toContain("ANTHROPIC_BASE_URL");
      // The harness's environment is told the bridge serves Anthropic with a key, so
      // Claude Code gets a stand-in and doesn't say it isn't logged in (HAL-13795).
      expect(fakes.bridges.map((bridge) => bridge.keyProviders)).toEqual([["anthropic"]]);
      // No file the program may read holds the key either.
      expect(filesWithKey).toEqual([]);
      // The run log names the provider the key came from, never the key.
      expect(log).toContain('"provider":"claude"');
      expect(log).not.toContain(key);
      expect(told).toEqual([
        {
          kind: "key",
          provider: "anthropic",
          providerId: "claude",
          secret: "anthropic-key",
          baseUrl: providerAddress,
        },
      ]);
    },
    gitTimeout,
  );

  it.skipIf(noUnixSockets)(
    "[platform:win32] no Unix socket for the bridge: sends the key only to the address of the provider it was picked from",
    async () => {
      const version = await workspaceWith({
        "providers/claude.yaml": claudeProvider,
        "providers/other.yaml": `id: other\ntype: anthropic\nsecret: other-key\nbaseUrl: ${otherAddress}\n`,
        "hubs/lab/agents/coder.agent.yaml": coderOnClaude,
      });
      const provider = fakeProvider();
      const secrets = { get: async (name: string) => (name === "other-key" ? "other" : key) };

      const { replies } = await runWithModelCall(version, { secrets, http: provider.http });

      expect(replies).toEqual([expect.objectContaining({ status: 200 })]);
      expect(provider.calls.map((call) => new URL(call.url).origin)).toEqual([
        new URL(providerAddress).origin,
      ]);
      expect(provider.calls[0]?.headers.get("x-api-key")).toBe(key);
    },
    gitTimeout,
  );

  it("lets the bridge read only a secret a provider file names", async () => {
    await writeFile(join(acme, "providers/claude.yaml"), claudeProvider);
    const workspace = await loadWorkspace(new FolderDefinitionStore(acme));
    const asked: string[] = [];
    const keys = cliProviderKeys({
      workspace: () => workspace,
      secrets: {
        get: async (name) => {
          asked.push(name);
          return key;
        },
      },
      trusted: true,
      keyOrigins: noKeyOrigins,
    });

    expect(await keys.bridgeSecrets.get("github-token")).toBeNull();
    expect(await keys.bridgeSecrets.get("anthropic-key")).toBe(key);
    expect(asked).toEqual(["anthropic-key"]);
    expect(keys.scrub(`failed with ${key}`)).toBe("failed with [secret removed]");
  });

  it(
    "keeps the program's own sign-in for an agent set to On this computer",
    async () => {
      const version = await workspaceWith({
        "providers/claude.yaml": claudeProvider,
        "hubs/lab/agents/coder.agent.yaml": coderOnClaude,
      });
      await chooseThisComputer();
      const told: ProviderAccessChoice[] = [];

      await runWithModelCall(version, {
        secrets: savedKey,
        reportAccess: (_agent, choice) => told.push(choice),
      });

      expect(told).toEqual([{ kind: "sign-in", provider: "anthropic", reason: "this-computer" }]);
    },
    gitTimeout,
  );

  it(
    "stops before the program starts when the key's secret holds no value, naming the command that saves it",
    async () => {
      const version = await workspaceWith({
        "providers/claude.yaml": claudeProvider,
        "hubs/lab/agents/coder.agent.yaml": coderOnClaude,
      });
      const provider = fakeProvider();

      const { fakes, summary } = await runWithModelCall(version, { http: provider.http });

      expect(summary).toMatchObject({ status: "failed" });
      expect(JSON.stringify(summary)).toContain("halonic secret set anthropic-key");
      expect(fakes.programStarts).toBe(0);
      expect(provider.calls).toEqual([]);
    },
    gitTimeout,
  );

  it(
    "stops before the program starts when an untrusted workspace would send the key to an address other than the type's own",
    async () => {
      const version = await workspaceWith({
        "providers/claude.yaml": claudeProvider,
        "hubs/lab/agents/coder.agent.yaml": coderOnClaude,
      });
      const provider = fakeProvider();

      const { fakes, summary } = await runWithModelCall(version, {
        secrets: savedKey,
        http: provider.http,
        trusted: false,
      });

      expect(summary).toMatchObject({ status: "failed" });
      expect(JSON.stringify(summary)).toContain("this workspace isn't trusted on this computer");
      expect(fakes.programStarts).toBe(0);
      expect(provider.calls).toEqual([]);
    },
    gitTimeout,
  );

  it(
    "stops before the program starts when the key's allowed addresses leave out the provider's address",
    async () => {
      const version = await workspaceWith({
        "providers/claude.yaml": claudeProvider,
        "hubs/lab/agents/coder.agent.yaml": coderOnClaude,
      });
      const provider = fakeProvider();
      const keyOrigins = {
        allowedOrigins: async () => [new URL(otherAddress).origin],
      };

      const { fakes, summary } = await runWithModelCall(version, {
        secrets: savedKey,
        http: provider.http,
        keyOrigins,
      });

      expect(summary).toMatchObject({
        status: "failed",
        error: expect.stringContaining(
          `halonic models allow-address "anthropic-key" ${new URL(providerAddress).origin}`,
        ),
      });
      expect(fakes.programStarts).toBe(0);
      expect(provider.calls).toEqual([]);
    },
    gitTimeout,
  );

  it(
    "stops before the program starts when the provider has its own address and the agent's model isn't one of its models",
    async () => {
      const version = await workspaceWith({ "providers/claude.yaml": claudeProvider });
      const provider = fakeProvider();

      const { fakes, summary } = await runWithModelCall(version, {
        secrets: savedKey,
        http: provider.http,
      });

      expect(summary).toMatchObject({
        status: "failed",
        error: expect.stringContaining('Set the agent\'s model to "claude/<model>"'),
      });
      expect(fakes.programStarts).toBe(0);
      expect(provider.calls).toEqual([]);
    },
    gitTimeout,
  );

  it.skipIf(noUnixSockets)(
    "[platform:win32] no Unix socket for the bridge: scrubs the key out of a failed provider call before the run log records it",
    async () => {
      const version = await workspaceWith({
        "providers/claude.yaml": claudeProvider,
        "hubs/lab/agents/coder.agent.yaml": coderOnClaude,
      });
      // The reply starts, then breaks with an error that quotes the key, as a broken proxy might.
      const provider = fakeProvider(
        () =>
          new Response(
            new ReadableStream({
              pull: (controller) => controller.error(new Error(`connection reset, sent ${key}`)),
            }),
            { headers: { "content-type": "application/json" } },
          ),
      );

      const { log } = await runWithModelCall(version, { secrets: savedKey, http: provider.http });

      expect(log).toContain("bridge.failed");
      expect(log).toContain("connection reset, sent [secret removed]");
      expect(log).not.toContain(key);
    },
    gitTimeout,
  );
});

/** A person chose "On this computer" for the coder, for its file as it is now. */
async function chooseThisComputer(): Promise<void> {
  const placement = new AgentPlacement({
    store: new FileAgentPlacementStore(placementFolder(profileFolder(profile))),
    digest: webCryptoDigest,
    clock: fixedClock(Date.parse("2026-11-19T10:00:00.000Z")),
  });
  const file = new Uint8Array(await readFile(join(acme, "hubs/lab/agents/coder.agent.yaml")));
  const subject = { location: await realpath(acme), hub: "lab", agent: "coder", file };
  const shown = await agentFingerprint(file, webCryptoDigest);
  expect((await placement.chooseThisComputer(subject, shown)).ok).toBe(true);
}
