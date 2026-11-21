import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import type { PluginBackendMachine } from "@halonicjs/adapter-integration-runner";
import { nodeLaunchFolders } from "@halonicjs/adapter-mcp";
import { MemorySecrets, MemoryTokenStore, MemoryTrustStore } from "@halonicjs/adapter-memory";
import { type PluginPartUnavailable, readPluginFolder } from "@halonicjs/app";
import type { ConnectorFactoryContext, Sandbox, SandboxFence } from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PluginConnectorFactory, pluginConnectorSources } from "./plugin-connector-factory.ts";
import { removeTestFolder } from "./test/remove-folder.ts";
import { webCryptoDigest } from "./workspace-runs.ts";
import { cliTrustService } from "./workspace-trust.ts";

// Attacks on a plugin's local tool through the CLI's plugin connector that
// need no real fence (HAL-13056): the plugin's files change while its session
// is prepared, a session opens without a proven fence, and a manifest names
// a variable Halonic sets itself. The sandbox only records what reached it.
// The attacks that need the real fence are in
// `fence/plugin-local-tool-attacks.fence.test.ts`.

const clock = fixedClock(Date.UTC(2026, 10, 21, 9));

const manifest = (env = "") => `id: files
version: 1.0.0
sdk: 1
name: Files
localTools:
  - id: lister
    start: { script: { program: node, path: tools/server.js } }
${env}    tools:
      - { name: list-files, description: Lists the files., risk: read, untrusted: true }
ui:
  settings:
    root: { label: Folder, type: text }
`;

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "halonic-cli-plugin-attack-"));
  await put({
    "plugins/files/plugin.yaml": manifest(),
    "plugins/files/tools/server.js": "console.log('lister');\n",
    "home/.ssh/id_ed25519": "person-ssh-key",
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

/** A sandbox that opens sessions with `fence` and counts what reached it; no program ever starts. */
function recordingSandbox(fence: SandboxFence) {
  const seen = { opens: 0, starts: 0, closes: 0 };
  const sandbox: Pick<Sandbox, "check" | "open"> = {
    check: async () => ({ ok: true, reason: null, missing: [] }),
    open: async (profile) => {
      seen.opens += 1;
      return {
        profile,
        fence,
        start: async () => {
          seen.starts += 1;
          throw new Error("this sandbox starts no program");
        },
        onBlocked: () => () => undefined,
        close: async () => {
          seen.closes += 1;
        },
      };
    },
  };
  return { sandbox, seen };
}

/** The CLI's connector for the trusted plugin `files`; `beforeFolder` runs before each session folder is made. */
async function setUp(sandbox: Pick<Sandbox, "check" | "open">, beforeFolder = async () => {}) {
  const plugins = new FileSystemFolderReader(join(root, "plugins"), join(root, "plugins"));
  const trust = cliTrustService(new MemoryTrustStore(), clock);
  const read = await readPluginFolder(plugins, webCryptoDigest, "files");
  if (!read.ok) throw new Error("the fixture plugin must read");
  await trust.grantPlugin(read.value, (await trust.checkPlugin(read.value)).fingerprint, "cli");
  const machine = { plugins, digest: webCryptoDigest, trust, settings: async () => ({}) };
  const unavailable: PluginPartUnavailable["reason"][] = [];
  const sessions = join(root, "sessions");
  const sources = pluginConnectorSources(
    machine as unknown as PluginBackendMachine,
    {
      sandbox,
      deniedPaths: [join(root, "profile")],
      env: {},
      home: join(root, "home"),
      folders: {
        create: async () => {
          await beforeFolder();
          return await mkdtemp(join(sessions, "session-"));
        },
        remove: (folder) => nodeLaunchFolders.remove(folder),
      },
      timeLimitMs: 60_000,
      onUnavailable: (_connector, part) => unavailable.push(part.reason),
      onReleaseFailed: () => undefined,
    },
    { name: "halonic", version: "0.0.0-test" },
  );
  const context = {
    secrets: new MemorySecrets({}),
    tokens: new MemoryTokenStore(),
    http: {},
    workspaceRoot: root,
    trust: null,
  } as unknown as ConnectorFactoryContext;
  const connector = new PluginConnectorFactory(sources).create(
    { id: "my-files", transport: { kind: "plugin", id: "files" }, secretEnv: {} },
    context,
  );
  return { connector, unavailable, sessions };
}

const fenced: SandboxFence = { state: "fenced" };

verifies("cli.plugin-local-tools", () => {
  describe("a plugin's script swapped after the trust check, while its session is prepared", () => {
    it.each([
      [
        "for other code",
        () => put({ "plugins/files/tools/server.js": "console.log('swapped');\n" }),
      ],
      [
        "for a link to a credential",
        async () => {
          await rm(join(root, "plugins/files/tools/server.js"));
          await symlink(
            join(root, "home/.ssh/id_ed25519"),
            join(root, "plugins/files/tools/server.js"),
          );
        },
      ],
    ])("%s is never copied or started, and no folder is left", async (_case, swap) => {
      const { sandbox, seen } = recordingSandbox(fenced);
      let swapped = false;
      const { connector, unavailable, sessions } = await setUp(sandbox, async () => {
        if (swapped) return;
        swapped = true;
        await swap();
      });

      await expect(connector.listTools()).rejects.toThrow();

      expect(swapped).toBe(true);
      expect(unavailable).toEqual([{ kind: "failed" }]);
      expect(seen).toEqual({ opens: 0, starts: 0, closes: 0 });
      expect(await readdir(sessions)).toEqual([]);
      await connector.close();
    });
  });

  it("starts nothing in a session whose fence isn't proven, and says why", async () => {
    const { sandbox, seen } = recordingSandbox({ state: "not-fenced", reason: "probe reached" });
    const { connector, unavailable, sessions } = await setUp(sandbox);

    await expect(connector.listTools()).rejects.toThrow();

    expect(unavailable).toEqual([{ kind: "sandbox-not-fenced", fence: "not-fenced" }]);
    expect(seen).toEqual({ opens: 1, starts: 0, closes: 1 });
    expect(await readdir(sessions)).toEqual([]);
    await connector.close();
  });

  describe("a local tool's env naming a variable", () => {
    /** Whether the plugin reads, as `halonic trust --plugin` reads it, with `variable` taking the setting `root`. */
    async function readsWith(variable: string): Promise<boolean> {
      await put({
        "plugins/files/plugin.yaml": manifest(`    env:\n      ${variable}: { setting: root }\n`),
      });
      const plugins = new FileSystemFolderReader(join(root, "plugins"), join(root, "plugins"));
      return (await readPluginFolder(plugins, webCryptoDigest, "files")).ok;
    }

    it("of its own reads, so the refusals below are for the name", async () => {
      expect(await readsWith("ACME_ROOT")).toBe(true);
    });

    it.each(["HOME", "PATH", "TMPDIR", "Path", "home"])(
      "that Halonic sets, %s, can never be trusted, and starts nothing once changed to it",
      async (variable) => {
        const { sandbox, seen } = recordingSandbox(fenced);
        const { connector } = await setUp(sandbox);

        expect(await readsWith(variable)).toBe(false);
        await expect(connector.listTools()).rejects.toThrow();
        expect(seen.opens).toBe(0);
        await connector.close();
      },
    );
  });
});
