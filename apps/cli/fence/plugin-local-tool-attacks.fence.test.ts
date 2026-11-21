import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileSystemFolderReader, FileTrustStore } from "@halonicjs/adapter-fs-node";
import { readPluginFolder, WorkflowRuns } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import { pluginsFolder, profileFolder, trustFolder } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandContext } from "../src/command.ts";
import { runMessages } from "../src/messages/run.ts";
import { removeTestFolder } from "../src/test/remove-folder.ts";
import { openWorkspaceDir } from "../src/workspace-dir.ts";
import { openWorkspaceEngine } from "../src/workspace-engine.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "../src/workspace-runs.ts";
import {
  assertTrustable,
  cliTrustService,
  readWorkspaceTrust,
  trustedGrant,
  type WorkspaceTrustMachine,
} from "../src/workspace-trust.ts";

// A trusted plugin's hostile local tool, started by `halonic run` through the
// CLI's real wiring (HAL-13056): the plugin's connector, its session from a
// copy of the checked files, the place and the srt sandbox are this
// computer's. Only the model is the test model, which calls the tool's
// attacks one by one. The place's own attacks are in
// `connector-stdio-sandbox/fence/plugin-local-tool-place-attacks.test.ts`;
// this file checks that the CLI builds that place, and reuses its hostile
// server.
//
// The layout is the one #3830 attacks: a home folder with credential folders
// (`HOME` points at it for the test), and Halonic's profile, which holds the
// plugin's folder. Like the other tests against the real fence, it runs with
// `pnpm test:fence` in the sandbox CI jobs and never skips.

const hostileServer = fileURLToPath(
  new URL(
    "../../../packages/adapters/connector-stdio-sandbox/fence/hostile-server.ts",
    import.meta.url,
  ),
);
const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const runTimeout = 120_000;
const clock = fixedClock(Date.UTC(2026, 10, 21, 9));
const noCommands = { path: undefined, endings: [] };

/** The hostile server's tools, as its plugin declares them. */
const declared = [
  ["fetch_url", "Fetches a URL."],
  ["read_file", "Reads a file."],
  ["write_file", "Writes a file."],
  ["read_env", "Reads its environment."],
  ["edit_own_script", "Changes its own script."],
] as const;

const manifest = `id: notes
version: 1.0.0
sdk: 1
name: Notes
localTools:
  - id: notes
    start: { script: { program: node, path: tools/server.ts } }
    tools:
${declared.map(([name, description]) => `      - { name: ${name}, description: ${description}, risk: read, untrusted: true }`).join("\n")}
`;

/** One call the test model makes: a tool and its arguments. */
type ToolCall = readonly [tool: (typeof declared)[number][0], args: Record<string, string>];

let base: string;
let acme: string;
let profile: string;
let home: string;
const saved: Record<string, string | undefined> = {};

const inBase = (...parts: string[]) => join(base, ...parts);
const pluginFile = (...parts: string[]) => join(profile, "plugins", "notes", ...parts);

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "halonic-cli-plugin-attack-"));
  acme = inBase("acme");
  profile = inBase("profile");
  home = inBase("home");
  await cp(acmeExample, acme, { recursive: true });
  // The attacks need the plugin offered whatever the workspace's privacy setting; local-only runs are tested elsewhere.
  const settings = await readFile(join(acme, "workspace.yaml"), "utf8");
  await writeFile(
    join(acme, "workspace.yaml"),
    settings.replace("localOnly: true", "localOnly: false"),
  );
  for (const name of ["HALONIC_HOME", "HOME"]) saved[name] = process.env[name];
  // The command reads the profile and the home folder from the environment, as a person's does.
  process.env["HALONIC_HOME"] = profile;
  process.env["HOME"] = home;
  await put(home, { ".ssh/id_ed25519": "person-ssh-key" });
  await put(profile, {
    "keys.json": "halonic-profile-keys",
    "plugins/notes/plugin.yaml": manifest,
    "plugins/notes/tools/server.ts": await readFile(hostileServer, "utf8"),
  });
  await put(acme, {
    "library/connectors/notes.connector.yaml": [
      "id: notes",
      "name: Notes",
      "transport:",
      "  plugin: { id: notes }",
      "tools:",
      `  allow: [${declared.map(([name]) => name).join(", ")}]`,
      `  read: [${declared.map(([name]) => name).join(", ")}]`,
      "",
    ].join("\n"),
    "hubs/reports/agents/reporter.agent.yaml":
      "id: reporter\nname: Reporter\nconnectors: [notes]\ninstructions: Use the notes.\n",
  });
});

afterEach(async () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await removeTestFolder(base);
});

async function put(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

/** The profile `HALONIC_HOME` names. */
function profileNow() {
  return profileFolder({ ...nodeProfileEnvironment(), variables: { HALONIC_HOME: profile } });
}

function trustMachine(): WorkspaceTrustMachine {
  return {
    trustStore: new FileTrustStore(trustFolder(profileNow())),
    clock,
    commandSearch: noCommands,
  };
}

/** Trusts the plugin as its folder is now, as `halonic trust --plugin notes` would. */
async function trustPlugin(): Promise<void> {
  const folder = new FileSystemFolderReader(pluginsFolder(profileNow()));
  const read = await readPluginFolder(folder, webCryptoDigest, "notes");
  if (!read.ok) throw new Error("The test plugin must read.");
  const trust = cliTrustService(trustMachine().trustStore, clock);
  await trust.grantPlugin(read.value, (await trust.checkPlugin(read.value)).fingerprint, "cli");
}

/** Has the test model call `calls` in order, then trusts the workspace as it is now. */
async function trustWorkspaceCalling(calls: readonly ToolCall[]): Promise<void> {
  const script = [...calls.map(([tool, args]) => `tool:${tool} ${JSON.stringify(args)}`), "Done"];
  await put(acme, {
    "providers/mock.yaml": `id: mock\nname: Test model\ntype: mock\nlocal: true\noptions:\n  script:\n    reporter: ${JSON.stringify(script)}\n`,
  });
  const machine = trustMachine();
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const loaded = await loadWorkspace(dir.store);
  const read = await readWorkspaceTrust(dir, noCommands, loaded);
  const service = cliTrustService(machine.trustStore, machine.clock);
  const check = await service.check(read.subject);
  assertTrustable(check, read);
  const granted = await service.grant(read.subject, check.fingerprint, "cli");
  if (!granted.ok) throw new Error(`The workspace couldn't be trusted: ${granted.error.kind}`);
}

/** What one run saw: the tool's answers in call order, and the calls refused before reaching it. */
interface RunOutcome {
  readonly results: readonly string[];
  readonly refused: readonly string[];
}

/** Runs Weekly report, whose Reporter makes the calls the test model was given, with this computer's real connectors. */
async function runReport(): Promise<RunOutcome> {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const workspace = await loadWorkspace(dir.store);
  const grant = await trustedGrant(
    dir,
    trustMachine(),
    undefined,
    runMessages.nothingRan(),
    workspace,
  );
  const context = {
    cwd: acme,
    secrets: { get: async () => null },
    signal: new AbortController().signal,
    debug: () => undefined,
    warn: () => undefined,
  } as unknown as CommandContext;
  const engine = await openWorkspaceEngine(
    context,
    {
      http: { fetch: () => Promise.reject(new TypeError("The run calls no server.")) },
      profile: { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: profile } },
      sandboxGate: () => ({
        sandbox: { check: () => Promise.reject(new Error("The agent needs no sandbox.")) },
        placement: { where: () => Promise.reject(new Error("The agent needs no placement.")) },
      }),
    },
    {
      holder: "run",
      dir,
      workspace,
      trust: grant,
      runs: [{ hubId: "reports", workflowId: "weekly-report" }],
      ending: runMessages.nothingRan(),
    },
  );
  const events: RunEvent[] = [];
  try {
    await new WorkflowRuns(engine.executor).startRun(
      workspace,
      "reports/weekly-report",
      {},
      {
        version: { reads: "saved-files" },
        onEvent: (event) => events.push(event),
      },
    );
  } finally {
    await engine.close();
  }
  return {
    results: events.flatMap((event) => (event.type === "tool.result" ? [event.result] : [])),
    refused: events.flatMap((event) =>
      event.type === "tool.refused" ? [`${event.tool}:${event.reason}`] : [],
    ),
  };
}

/** Answers every request with a body the local tool must never receive. */
async function listeningServer(): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => response.end("undeclared-host-body"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` };
}

describe("a trusted plugin's hostile local tool, started by halonic run", () => {
  it(
    "can't read the credentials or Halonic's profile, change its copy or reach an undeclared host",
    async () => {
      const host = await listeningServer();
      try {
        await trustPlugin();
        await trustWorkspaceCalling([
          ["write_file", { path: "mine.txt", text: "mine" }],
          ["read_file", { path: join(home, ".ssh/id_ed25519") }],
          ["read_file", { path: join(profile, "keys.json") }],
          ["read_file", { path: pluginFile("plugin.yaml") }],
          ["edit_own_script", {}],
          ["write_file", { path: pluginFile("tools/server.ts"), text: "changed" }],
          ["fetch_url", { url: host.url }],
          ["read_env", {}],
        ]);

        const { results } = await runReport();

        const [wrote, sshKey, profileKeys, pluginManifest, ownScript, original, fetched, env] =
          results;
        // It ran in its session and writes in its own working folder, so the refusals come from the fence.
        expect(wrote).toBe("wrote");
        for (const read of [sshKey, profileKeys, pluginManifest]) expect(read).toMatch(/^refused:/);
        expect(ownScript).toMatch(/^refused:/);
        // On Linux a denied folder is an empty tmpfs, so that write may succeed in there; the disk is what counts.
        expect(original).toBeDefined();
        expect(await readFile(pluginFile("tools/server.ts"), "utf8")).toBe(
          await readFile(hostileServer, "utf8"),
        );
        expect(fetched).toMatch(/^refused:|^reached:4\d\d:/);
        expect(fetched).not.toContain("undeclared-host-body");
        // Halonic sets HOME and the temp folder; the program never gets the person's.
        const seen = JSON.parse(env ?? "{}") as Record<string, string | undefined>;
        expect(seen["HOME"]).not.toBe(home);
        expect(seen["HALONIC_HOME"]).toBeUndefined();
      } finally {
        host.server.close();
      }
    },
    runTimeout,
  );

  it(
    "doesn't start a script edited after the trust, so the run never offers its tools",
    async () => {
      await trustPlugin();
      await trustWorkspaceCalling([["read_env", {}]]);
      const edited = (await readFile(hostileServer, "utf8")).replace(
        "JSON.stringify(process.env)",
        '"the edited script ran"',
      );
      await writeFile(pluginFile("tools/server.ts"), edited);

      const outcome = await runReport();

      // The trust is checked again when the connector opens, before any session or copy is made.
      expect(outcome.results).toEqual([]);
      expect(outcome.refused).toEqual(["read_env:not-offered"]);
    },
    runTimeout,
  );

  it(
    "denies a credential folder made between two runs from the next run on",
    async () => {
      // Known and accepted (harness-kit.home-denied-paths): on Linux a credential folder made
      // *during* a session stays readable by that session until it ends. This test makes it
      // between two runs, each with a session of its own, so the second must deny it.
      const readCloudKey: ToolCall = ["read_file", { path: join(home, ".aws/credentials") }];
      await trustPlugin();
      await trustWorkspaceCalling([readCloudKey]);
      const first = await runReport();
      await put(home, { ".aws/credentials": "person-cloud-key" });

      const second = await runReport();

      for (const { results } of [first, second]) {
        expect(results).toHaveLength(1);
        expect(results[0]).toMatch(/^refused:/);
      }
    },
    runTimeout,
  );
});
