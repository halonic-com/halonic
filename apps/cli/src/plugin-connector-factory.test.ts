import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import type { PluginBackendMachine } from "@halonicjs/adapter-integration-runner";
import { nodeLaunchFolders } from "@halonicjs/adapter-mcp";
import { MemorySecrets, MemoryTokenStore, MemoryTrustStore } from "@halonicjs/adapter-memory";
import { type PluginPartUnavailable, readPluginFolder } from "@halonicjs/app";
import type { ConnectorFactoryContext, Sandbox, SandboxCheck } from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import { PluginConnectorFactory, pluginConnectorSources } from "./plugin-connector-factory.ts";
import { pluginPartReporter } from "./plugin-part-warnings.ts";
import { removeTestFolder } from "./test/remove-folder.ts";
import { webCryptoDigest } from "./workspace-runs.ts";
import { cliTrustService } from "./workspace-trust.ts";

const clock = fixedClock(Date.UTC(2026, 10, 20, 9));
const noBubblewrap: SandboxCheck = {
  ok: false,
  reason: "bubblewrap-missing",
  missing: ["bubblewrap"],
};

const manifest = `id: files
version: 1.0.0
sdk: 1
name: Files
localTools:
  - id: lister
    start: { script: { program: node, path: tools/server.js } }
    tools:
      - { name: list-files, description: Lists the files., risk: read, untrusted: true }
`;

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "halonic-cli-plugin-connector-"));
  await put({
    "plugins/files/plugin.yaml": manifest,
    "plugins/files/tools/server.js": "console.log('lister');\n",
  });
  await mkdir(join(root, "sessions"));
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

/** A sandbox that can't start on this computer, as when bubblewrap is missing. */
const cantStart: Pick<Sandbox, "check" | "open"> = {
  check: async () => noBubblewrap,
  open: async () => {
    throw new Error("bwrap: command not found");
  },
};

/** The CLI's plugin connector for the `files` plugin, trusted as its folder is now. */
async function setUp() {
  const plugins = new FileSystemFolderReader(join(root, "plugins"), join(root, "plugins"));
  const trust = cliTrustService(new MemoryTrustStore(), clock);
  const read = await readPluginFolder(plugins, webCryptoDigest, "files");
  if (!read.ok) throw new Error("the fixture plugin must read");
  await trust.grantPlugin(read.value, (await trust.checkPlugin(read.value)).fingerprint, "cli");
  const machine = {
    plugins,
    digest: webCryptoDigest,
    trust,
    settings: async () => ({}),
  } as unknown as PluginBackendMachine;
  const sessions = join(root, "sessions");
  const unavailable: { connector: string; part: PluginPartUnavailable }[] = [];
  const factory = new PluginConnectorFactory(
    pluginConnectorSources(
      machine,
      {
        sandbox: cantStart,
        deniedPaths: [join(root, "profile")],
        env: {},
        home: root,
        folders: {
          create: async () => await mkdtemp(join(sessions, "session-")),
          remove: (folder) => nodeLaunchFolders.remove(folder),
        },
        timeLimitMs: 60_000,
        onUnavailable: (connector, part) => unavailable.push({ connector, part }),
        onReleaseFailed: () => undefined,
      },
      { name: "halonic", version: "0.0.0-test" },
    ),
    new MemorySecrets({}),
  );
  const context = {
    secrets: new MemorySecrets({}),
    tokens: new MemoryTokenStore(),
    http: {},
    workspaceRoot: root,
    trust: null,
  } as unknown as ConnectorFactoryContext;
  const client = () =>
    factory.create(
      { id: "my-files", transport: { kind: "plugin", id: "files" }, secretEnv: {} },
      context,
    );
  return { client, unavailable, sessions };
}

verifies("cli.plugin-local-tools", () => {
  it("leaves out a local tool whose sandbox can't start, says why, and leaves no session folder", async () => {
    const { client, unavailable, sessions } = await setUp();
    const connector = client();
    await expect(connector.listTools()).rejects.toThrow(/can't run on this computer/u);
    expect(unavailable.map(({ connector: id, part }) => [id, part.part, part.reason])).toEqual([
      ["my-files", "local:lister", { kind: "sandbox-unavailable", reason: "bubblewrap-missing" }],
    ]);
    expect(await readdir(sessions)).toEqual([]);
    await connector.close();
  });

  it("warns once for each connector, part and reason, then why on the lines under it", () => {
    const { lines, report } = reporter();
    const part: PluginPartUnavailable = {
      plugin: "files",
      part: "local:lister",
      reason: { kind: "sandbox-unavailable", reason: "bubblewrap-missing" },
      error: new Error("bwrap: command not found"),
    };
    report("my-files", part);
    report("my-files", part);
    report("my-files", { ...part, part: "backend", reason: { kind: "failed" } });
    expect(lines).toEqual([
      "warn ! The program lister of the plugin files didn't start, so its tools are off in this run.",
      "warn   bubblewrap isn't installed. Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap, then run it again.",
      "warn   More: https://docs.halonic.dev/security/sandbox/#bubblewrap (bubblewrap-missing)",
      "warn ! The backend of the plugin files didn't start, so its tools are off in this run.",
      "warn   bwrap: command not found",
    ]);
  });

  it("warns again for the same part when the reason's details differ", () => {
    const { lines, report } = reporter();
    const part: PluginPartUnavailable = {
      plugin: "files",
      part: "local:lister",
      reason: { kind: "sandbox-unavailable", reason: "container" },
      error: new Error("in a container"),
    };
    report("my-files", part);
    report("my-files", {
      ...part,
      reason: { kind: "sandbox-unavailable", reason: "bubblewrap-missing" },
    });
    expect(lines.filter((line) => line.startsWith("warn !"))).toHaveLength(2);
    expect(lines[1]).toBe(
      "warn   Halonic is running inside a container, and the sandbox can't start there. Run halonic run on the computer itself, not in a container. halonic validate and halonic test work in a container.",
    );
  });

  it("words a reason code it doesn't know as other's, never the code alone", () => {
    const { lines, report } = reporter();
    report("my-files", {
      plugin: "files",
      part: "local:lister",
      reason: { kind: "sandbox-unavailable", reason: "from-a-newer-port" as "other" },
      error: new Error("unknown"),
    });
    expect(lines.slice(1)).toEqual([
      "warn   Halonic can't tell what the sandbox is missing. See what the sandbox needs on this computer, then run it again.",
      "warn   More: https://docs.halonic.dev/security/sandbox/#other (from-a-newer-port)",
    ]);
  });

  it("says a session it couldn't confirm in a sandbox in words, with its fence only under --debug", () => {
    const { lines, report } = reporter();
    const part = { plugin: "files", part: "local:lister" } as const;
    report("my-files", {
      ...part,
      reason: { kind: "sandbox-not-fenced", fence: "not-fenced" },
      error: null,
    });
    report("my-files", { ...part, reason: { kind: "network-needs-srt" }, error: null });
    report("my-files", {
      ...part,
      reason: { kind: "settings-not-set", settings: ["root", "api_key"] },
      error: null,
    });
    expect(lines).toEqual([
      "warn ! The program lister of the plugin files didn't start, so its tools are off in this run.",
      "warn   Halonic couldn't confirm that the sandbox limits this program on this computer.",
      "debug the program's sandbox session opened with its fence not-fenced, so the program didn't start",
      "warn ! The program lister of the plugin files didn't start, so its tools are off in this run.",
      "warn   It reaches the network, and the Windows 11 sandbox can't limit a program to single sites yet.",
      "warn ! The program lister of the plugin files didn't start, so its tools are off in this run.",
      "warn   These settings of the plugin have no value: root, api_key.",
    ]);
  });
});

/** A reporter whose warnings and `--debug` lines are kept as plain text, each after its kind. */
function reporter() {
  const lines: string[] = [];
  const report = pluginPartReporter({
    warn: (line) => lines.push(`warn ${plainText(line)}`),
    debug: (line) => lines.push(`debug ${plainText(line)}`),
  });
  return { lines, report };
}
