import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import type { AddressCheckingHttpClient } from "@halonicjs/adapter-http-kit";
import type { StartedRunner } from "@halonicjs/adapter-integration-runner";
import {
  MemorySecrets,
  MemoryTokenStore,
  MemoryTrustStore,
  MemoryUnfencedRunConsentStore,
} from "@halonicjs/adapter-memory";
import {
  RunnerStartGate,
  type TrustCheck,
  trustContentInputOf,
  UnfencedRuns,
} from "@halonicjs/app";
import type { Connector } from "@halonicjs/format";
import type {
  ConnectorFactoryContext,
  ConnectorTransport,
  IntegrationHttpClient,
  IntegrationTool,
  Sandbox,
  SandboxCheck,
} from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationConnectorFactory } from "./integration-connector-factory.ts";
import { integrationTransport } from "./local-integration-machine.ts";
import { type LocalIntegrationMachine, openLocalIntegration } from "./open-local-integration.ts";
import { removeTestFolder } from "./test/remove-folder.ts";
import { webCryptoDigest } from "./workspace-runs.ts";
import { cliTrustService, workspaceIntegrations } from "./workspace-trust.ts";

/** The addresses each `https` connection was handed, in order. */
const connected = vi.hoisted(() => [] as string[][]);

// No test may reach a real network, so an `https` connection only records the
// addresses the transport's checked lookup hands it, then fails.
vi.mock("node:https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:https")>();
  const { EventEmitter } = await import("node:events");
  const request = (options: import("node:https").RequestOptions) => {
    options.lookup?.(options.hostname ?? "", { all: true }, (_error, entries) => {
      connected.push((entries as unknown as { address: string }[]).map((entry) => entry.address));
    });
    const outgoing = new EventEmitter();
    const fail = () => outgoing.emit("error", new Error("this test has no network"));
    return Object.assign(outgoing, { end: () => queueMicrotask(fail) });
  };
  return { ...actual, request };
});

/** These tests never take a yes back in another process and no start hangs, so no timer goes off. */
const idleTimers = { set: () => undefined, clear: () => undefined };

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

/** The sheet with its one host read from the `url` setting. */
const fromSettingSheet = sheet.replace(
  "hosts: [api.example.com]",
  "hosts: [{ fromSetting: url, class: private }]",
);

const readNote: IntegrationTool = {
  name: "read-note",
  description: "Reads a note.",
  parameters: { type: "object", properties: {} },
  risk: "read",
  untrusted: true,
};

let root: string;

beforeEach(async () => {
  connected.length = 0;
  root = await mkdtemp(join(tmpdir(), "halonic-cli-open-integration-"));
  await put({
    "integrations/notes/integration.yaml": sheet,
    "integrations/notes/backend/index.js": "export default {};\n",
  });
});

afterEach(async () => {
  await removeTestFolder(root);
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
async function setup(
  options: {
    check?: SandboxCheck;
    runnerBuilt?: boolean;
    beforeTrustCheck?: () => Promise<void>;
    /** The connector file's settings when the workspace is trusted. */
    trustedSettings?: Record<string, string>;
    /** The connector file's settings when the run opens it; the trusted ones unless a test says otherwise. */
    runSettings?: Record<string, string>;
    /** What the integration's requests go out through; one that answers `{}` unless a test says otherwise. */
    transport?: AddressCheckingHttpClient;
    /** What the runner's tool does with the kit's client; it answers with the tool's name unless a test says otherwise. */
    tool?: (http: IntegrationHttpClient) => Promise<string>;
  } = {},
) {
  const { check = passes, runnerBuilt = true, beforeTrustCheck, trustedSettings } = options;
  const { runSettings = trustedSettings } = options;
  const trust = cliTrustService(new MemoryTrustStore(), clock);
  // The trust check reads the integration's settings from its connector file,
  // as `trustContentInputOf` does for every command.
  const connectorFile: Connector = {
    version: 1,
    id: "notes",
    transport: {
      integration: {
        folder: "notes",
        ...(trustedSettings === undefined ? {} : { settings: trustedSettings }),
      },
    },
    tools: { approve: [] },
  };
  const loaded = {
    files: [
      { kind: "connector", path: "library/connectors/notes.connector.yaml", value: connectorFile },
    ],
  } as unknown as LoadedWorkspace;
  const subject = async () => ({
    location: root,
    connectors: [],
    commandPaths: new Map(),
    agents: [],
    integrations: trustContentInputOf(loaded, await workspaceIntegrations(root, root)).integrations,
    providers: [],
  });
  const shown = await trust.check(await subject());
  if (shown.status === "refused") throw new Error("nothing to refuse");
  await trust.grant(await subject(), shown.fingerprint, "cli");

  const seen = {
    starts: 0,
    stops: 0,
    entries: [] as string[],
    checks: 0,
    settings: [] as Readonly<Record<string, unknown>>[],
  };
  const machine: LocalIntegrationMachine = {
    workspace: new FileSystemFolderReader(root, root),
    digest: webCryptoDigest,
    gate: new RunnerStartGate({
      platform: "linux",
      fenced: sandbox(check),
      launcher: sandbox(check),
      runs: new UnfencedRuns({
        store: new MemoryUnfencedRunConsentStore(),
        clock,
        timers: idleTimers,
      }),
      timers: idleTimers,
    }),
    runtime: { node: "/node/bin/node", nodeFolder: "/node", runnerFile: "/runner/runner.mjs" },
    transport: options.transport ?? ({ fetch: async () => new Response("{}") } as never),
    trustCheck: async (): Promise<TrustCheck> => {
      seen.checks += 1;
      await beforeTrustCheck?.();
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
      seen.settings.push(start.settings);
      const runner: StartedRunner = {
        fence: { state: "fenced" },
        declaration: { name: "notes", version: "1.0.0", tools: [readNote] },
        stopped: new Promise(() => {}),
        callTool: async (name) => (options.tool ? options.tool(start.http) : `answer from ${name}`),
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
  const transport: ConnectorTransport = {
    kind: "integration",
    folder: "notes",
    ...(runSettings === undefined ? {} : { settings: runSettings }),
  };
  const client = () => factory.create({ id: "notes", transport, secretEnv: {} }, context);
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

    it("refuses when the sheet it read is not the trusted one, even if the folder is put back before the start", async () => {
      const { seen, client } = await setup({
        beforeTrustCheck: async () => await put({ "integrations/notes/integration.yaml": sheet }),
      });
      await put({
        "integrations/notes/integration.yaml": sheet.replace("api.example.com", "evil.example.com"),
      });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        /Connector "notes" didn't start: .*changed since the workspace was trusted/,
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

    it("starts with the connector file's settings, so a { fromSetting } host reads its URL", async () => {
      await put({ "integrations/notes/integration.yaml": fromSettingSheet });
      const settings = { url: "http://192.168.1.20:3100" };
      const { seen, client } = await setup({ trustedSettings: settings });
      expect(await client().callTool("read-note", {})).toBe("answer from read-note");
      expect(seen.settings).toEqual([settings]);
    });

    it("refuses when the connector file's URL changed since the workspace was trusted", async () => {
      await put({ "integrations/notes/integration.yaml": fromSettingSheet });
      const { seen, client } = await setup({
        trustedSettings: { url: "http://192.168.1.20:3100" },
        runSettings: { url: "http://192.168.1.99:3100" },
      });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        /Connector "notes" didn't start: .*from its settings, changed since the workspace was trusted/,
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

verifies("format.integration-host-class", () => {
  describe("a private setting that holds a host name", () => {
    const name = "box.tail1234.ts.net";

    /** Opens the integration with its `url` set to the name, over the CLI's own transport answering `answers`. */
    async function privateName(answers: readonly string[]) {
      await put({ "integrations/notes/integration.yaml": fromSettingSheet });
      const lookups: string[] = [];
      const transport = integrationTransport(async (hostname) => {
        lookups.push(hostname);
        return answers;
      });
      const { seen, client } = await setup({
        trustedSettings: { url: `https://${name}` },
        transport,
        tool: async (http) => await (await http.fetch(`https://${name}/notes`)).text(),
      });
      return { seen, lookups, call: () => client().callTool("read-note", {}) };
    }

    it("connects only to the private addresses of a mixed answer", async () => {
      const { lookups, call } = await privateName(["93.184.215.14", "100.116.12.34", "10.0.0.5"]);
      await expect(call()).rejects.toThrow();
      expect(lookups).toEqual([name]);
      expect(connected).toEqual([["100.116.12.34", "10.0.0.5"]]);
    });

    it.each([
      [["93.184.215.14"]],
      [["100.100.100.100"]],
      [["100.100.100.200", "169.254.169.254", "127.0.0.1"]],
    ])("refuses a name whose answer is %j before any connection", async (answers) => {
      const { seen, lookups, call } = await privateName(answers);
      await expect(call()).rejects.toThrow(/no address a private host may reach/);
      expect(seen.starts).toBe(1);
      expect(lookups).toEqual([name]);
      expect(connected).toEqual([]);
    });

    it("refuses it on a transport that can't check where a name points, and starts no runner", async () => {
      await put({ "integrations/notes/integration.yaml": fromSettingSheet });
      const { seen, client } = await setup({
        trustedSettings: { url: `https://${name}` },
        transport: { fetch: async () => new Response("{}") } as never,
      });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        /can't check that box\.tail1234\.ts\.net points to a private address/,
      );
      expect(seen.starts).toBe(0);
    });
  });
});
