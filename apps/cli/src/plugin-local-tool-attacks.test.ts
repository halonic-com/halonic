import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import type { PluginBackendMachine } from "@halonicjs/adapter-integration-runner";
import { nodeLaunchFolders } from "@halonicjs/adapter-mcp";
import { MemorySecrets, MemoryTokenStore, MemoryTrustStore } from "@halonicjs/adapter-memory";
import { type PluginPartUnavailable, readPluginFolder } from "@halonicjs/app";
import {
  type ConnectorFactoryContext,
  type Sandbox,
  type SandboxFence,
  type SandboxProfile,
  workspaceSecrets,
} from "@halonicjs/ports";
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
// a variable Halonic sets itself, from a setting or from a stored secret. The
// sandbox only records what reached it.
// The attacks that need the real fence are in
// `fence/plugin-local-tool-attacks.fence.test.ts`.

const clock = fixedClock(Date.UTC(2026, 10, 21, 9));

/** The value stored for the plugin's own secret `acme-key`. */
const acmeKey = "acme-key-value-1234";

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

/** A sandbox that opens sessions with `fence`, counts what reached it and keeps each profile; no program ever starts. */
function recordingSandbox(fence: SandboxFence) {
  const seen = { opens: 0, starts: 0, closes: 0 };
  const profiles: SandboxProfile[] = [];
  const sandbox: Pick<Sandbox, "check" | "open"> = {
    check: async () => ({ ok: true, reason: null, missing: [] }),
    open: async (profile) => {
      seen.opens += 1;
      profiles.push(profile);
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
  return { sandbox, seen, profiles };
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
  // As `halonic run` hands them out: the store to the plugin's factory, the
  // workspace's picks, which refuse every plugin's name, to the connector.
  const stored = new MemorySecrets({ "plugin__files__acme-key": acmeKey });
  const context = {
    secrets: workspaceSecrets(stored),
    tokens: new MemoryTokenStore(),
    http: {},
    workspaceRoot: root,
    trust: null,
  } as unknown as ConnectorFactoryContext;
  const connector = new PluginConnectorFactory(sources, stored).create(
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
    /** The local tool's lines that give `variable` the setting `root` or the stored secret `acme-key`. */
    const envLines = (variable: string, from: "setting" | "secret") =>
      from === "setting"
        ? `    env:\n      ${variable}: { setting: root }\n`
        : "    network: [api.acme.com]\n" +
          "    secrets: { acme-key: { purpose: The key., hosts: [api.acme.com] } }\n" +
          `    env:\n      ${variable}: { secret: acme-key }\n`;

    /** Writes the manifest with `variable`, then whether the plugin reads, as `halonic trust --plugin` reads it. */
    async function readsWith(variable: string, from: "setting" | "secret"): Promise<boolean> {
      await put({ "plugins/files/plugin.yaml": manifest(envLines(variable, from)) });
      const plugins = new FileSystemFolderReader(join(root, "plugins"), join(root, "plugins"));
      return (await readPluginFolder(plugins, webCryptoDigest, "files")).ok;
    }

    it.each(["setting", "secret"] as const)(
      "of its own, from a %s, reads, so the refusals below are for the name",
      async (from) => {
        expect(await readsWith("ACME_ROOT", from)).toBe(true);
      },
    );

    it("of its own gets the plugin's stored secret, and never moves Halonic's HOME", async () => {
      expect(await readsWith("ACME_KEY", "secret")).toBe(true);
      const { sandbox, profiles } = recordingSandbox(fenced);
      const { connector } = await setUp(sandbox);

      await expect(connector.listTools()).rejects.toThrow();

      expect(profiles).toHaveLength(1);
      expect(profiles[0]?.env["ACME_KEY"]).toBe(acmeKey);
      expect(profiles[0]?.env["HOME"]).toBe(profiles[0]?.workingFolder);
      await connector.close();
    });

    const reserved = ["HOME", "PATH", "TMPDIR", "Path", "home"];
    it.each(
      reserved.flatMap((variable) => [
        [variable, "setting"] as const,
        [variable, "secret"] as const,
      ]),
    )(
      "that Halonic sets, %s, from a %s, fails the plugin check, so it can never be trusted",
      async (variable, from) => {
        const { sandbox, seen } = recordingSandbox(fenced);
        const { connector } = await setUp(sandbox);

        // The read proves the name rule. A trusted plugin edited to it also
        // starts nothing, but that is the trust re-check, which any edit trips.
        expect(await readsWith(variable, from)).toBe(false);
        await expect(connector.listTools()).rejects.toThrow();
        expect(seen.opens).toBe(0);
        await connector.close();
      },
    );
  });
});
