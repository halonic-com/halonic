import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import type { StartedRunner } from "@halonicjs/adapter-integration-runner";
import {
  MemorySecrets,
  MemoryTokenStore,
  MemoryTrustStore,
  MemoryUnfencedRunConsentStore,
} from "@halonicjs/adapter-memory";
import { RunnerStartGate, type TrustCheck, UnfencedRuns } from "@halonicjs/app";
import type {
  ConnectorFactoryContext,
  IntegrationTool,
  Sandbox,
  SandboxCheck,
} from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IntegrationConnectorFactory } from "./integration-connector-factory.ts";
import { type LocalIntegrationMachine, openLocalIntegration } from "./open-local-integration.ts";
import { webCryptoDigest } from "./workspace-runs.ts";
import { cliTrustService, workspaceIntegrations } from "./workspace-trust.ts";

const clock = fixedClock(Date.UTC(2026, 10, 12, 9));
const passes: SandboxCheck = { ok: true, reason: null, missing: [] };
const onWindows: SandboxCheck = { ok: false, reason: "windows", missing: [] };

const sheet = `id: notes
version: 1.0.0
kit: 1
provides: [connector]
hosts: [api.example.com]
tools:
  - { name: read-note, description: Reads a note., risk: read, untrusted: true }
`;

const readNote: IntegrationTool = {
  name: "read-note",
  description: "Reads a note.",
  parameters: { type: "object", properties: {} },
  risk: "read",
  untrusted: true,
};

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "halonic-cli-open-integration-"));
  await put({
    "integrations/notes/integration.yaml": sheet,
    "integrations/notes/backend/index.js": "export default {};\n",
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

/** A sandbox the gate only checks; the runner's start is faked. */
function sandbox(check: SandboxCheck): Sandbox {
  return {
    check: async () => check,
    capabilities: () => ({ files: "shared", strength: "os" }),
    open: async () => {
      throw new Error("the fake start never opens a session");
    },
  };
}

/** Everything the opener uses, with a runner that answers `answer` and counts its starts and stops. */
async function setup(options: { check?: SandboxCheck; runnerBuilt?: boolean } = {}) {
  const { check = passes, runnerBuilt = true } = options;
  const trust = cliTrustService(new MemoryTrustStore(), clock);
  const subject = async () => ({
    location: root,
    connectors: [],
    commandPaths: new Map(),
    agents: [],
    integrations: await workspaceIntegrations(root, root),
    providers: [],
  });
  const shown = await trust.check(await subject());
  if (shown.status === "refused") throw new Error("nothing to refuse");
  await trust.grant(await subject(), shown.fingerprint, "cli");

  const seen = { starts: 0, stops: 0, entries: [] as string[], checks: 0 };
  const machine: LocalIntegrationMachine = {
    workspace: new FileSystemFolderReader(root, root),
    digest: webCryptoDigest,
    gate: new RunnerStartGate({
      platform: "linux",
      fenced: sandbox(check),
      launcher: sandbox(check),
      runs: new UnfencedRuns({ store: new MemoryUnfencedRunConsentStore(), clock }),
    }),
    runtime: { node: "/node/bin/node", nodeFolder: "/node", runnerFile: "/runner/runner.mjs" },
    transport: { fetch: async () => new Response("{}") } as never,
    trustCheck: async (): Promise<TrustCheck> => {
      seen.checks += 1;
      return await trust.check(await subject());
    },
    runnerMachine: async () => ({
      homeFolder: "home-folder",
      socketFolders: [],
      systemFiles: [],
      sandboxFolders: [],
      tempFolder: "temp-folder",
      timeLimitMs: 1000,
    }),
    runnerExists: () => runnerBuilt,
    startRunner: async (start) => {
      seen.starts += 1;
      seen.entries.push(`${start.entry.file}#${start.entry.exportName}`);
      const runner: StartedRunner = {
        fence: { state: "fenced" },
        declaration: { name: "notes", version: "1.0.0", tools: [readNote] },
        stopped: new Promise(() => {}),
        callTool: async (name) => `answer from ${name}`,
        close: async () => {
          seen.stops += 1;
        },
      };
      return runner;
    },
  };
  const context = {
    secrets: new MemorySecrets({}),
    tokens: new MemoryTokenStore(),
    workspaceRoot: root,
    trust: null,
  } as unknown as ConnectorFactoryContext;
  const factory = new IntegrationConnectorFactory(openLocalIntegration(machine));
  const client = () =>
    factory.create(
      { id: "notes", transport: { kind: "integration", folder: "notes" }, secretEnv: {} },
      context,
    );
  return { seen, client };
}

verifies("cli.open-local-integration", () => {
  describe("openLocalIntegration", () => {
    it("starts the runner from backend/index.js with the default export and calls its tool", async () => {
      const { seen, client } = await setup();
      const opened = client();
      expect(await opened.callTool("read-note", {})).toBe("answer from read-note");
      expect(seen.entries).toEqual([
        `${join(root, "integrations/notes/backend/index.js")}#default`,
      ]);
      await opened.close();
      expect(seen.stops).toBe(1);
    });

    it("refuses a folder that changed since it was trusted, and starts no runner", async () => {
      const { seen, client } = await setup();
      await put({ "integrations/notes/backend/index.js": "export default { changed: true };\n" });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        /Connector "notes" didn't start: .*only once the workspace is trusted/,
      );
      expect(seen.starts).toBe(0);
    });

    it("checks the folder again at a later start, so a file edited between two starts is refused", async () => {
      const { seen, client } = await setup();
      const first = client();
      await first.callTool("read-note", {});
      await first.close();
      await put({ "integrations/notes/backend/index.js": "export default { edited: true };\n" });
      await expect(client().callTool("read-note", {})).rejects.toThrow(/didn't start/);
      expect(seen.starts).toBe(1);
      expect(seen.checks).toBe(2);
    });

    it("refuses when the sandbox isn't there and running without it isn't allowed (Windows)", async () => {
      const { seen, client } = await setup({ check: onWindows });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        /Connector "notes" didn't start: the sandbox isn't available here \(windows\)/,
      );
      expect(seen.starts).toBe(0);
    });

    it("refuses when the integration runner isn't built, and starts no runner", async () => {
      const { seen, client } = await setup({ runnerBuilt: false });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        "Connector \"notes\" didn't start: the integration runner isn't built",
      );
      expect(seen.starts).toBe(0);
    });
  });
});
