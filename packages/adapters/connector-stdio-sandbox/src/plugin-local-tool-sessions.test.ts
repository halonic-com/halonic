import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LaunchFolders, RunnerSearch } from "@halonicjs/adapter-mcp";
import {
  type LocalToolSet,
  LocalToolSettingsNotSetError,
  type PluginSettingValues,
  pluginPartUnavailableReason,
  type TrustedPluginFolder,
} from "@halonicjs/app";
import { type Plugin, parseFile } from "@halonicjs/format";
import type { HttpClient, Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localToolLaunch } from "./local-tool-launch.ts";
import { PluginFileChangedError } from "./plugin-copy.ts";
import { PluginLocalToolSessions } from "./plugin-local-tool-sessions.ts";

/** A plugin with one local tool started by a script, with a setting and a secret. */
const notesManifest = `id: notes
version: 1.0.0
sdk: 1
name: Notes
localTools:
  - id: server
    start: { script: { program: node, path: server/main.js } }
    env:
      NOTES_ROOT: { setting: root }
      NOTES_KEY: { secret: notes-key }
    secrets:
      notes-key: { purpose: Reads your notes account, hosts: [notes.example.com] }
    network: [notes.example.com]
    callTimeoutMs: 5000
    tools:
      - { name: list-notes, description: Lists the notes., risk: read, untrusted: true }
ui:
  settings:
    root: { label: Folder, type: text, required: true }
`;

const script = "console.log('notes');\n";

function pluginFrom(manifest: string): Plugin {
  const parsed = parseFile("plugin", manifest);
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return parsed.value.value;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const plugin = pluginFrom(notesManifest);
const trust = { location: "/unused", fingerprint: "hpf1:notes" };
const set: LocalToolSet = {
  plugin: "notes",
  part: "local:server",
  declared: plugin.localTools?.[0]?.tools ?? [],
  trust,
};

/** Secrets that hold only the notes plugin's key, and remember every name asked for. */
class TestSecrets implements Secrets {
  readonly asked: string[] = [];

  async get(name: string): Promise<string | null> {
    this.asked.push(name);
    return name === "plugin__notes__notes-key" ? "key-value" : null;
  }
}

/** Launch folders under one test folder, so a test can see which are left. */
class TestFolders implements LaunchFolders {
  readonly #root: string;
  #made = 0;

  constructor(root: string) {
    this.#root = root;
  }

  async create(): Promise<string> {
    this.#made += 1;
    const folder = join(this.#root, `launch-${this.#made}`);
    await mkdir(folder);
    return folder;
  }

  async remove(folder: string): Promise<void> {
    await rm(folder, { recursive: true, force: true });
  }

  /** The launch folders that still exist. */
  async left(): Promise<string[]> {
    return (await readdir(this.#root)).sort();
  }
}

const noHttp: HttpClient = {
  request: async () => {
    throw new Error("a script asks no registry");
  },
} as unknown as HttpClient;

const noRunners = { platform: "linux" } as unknown as RunnerSearch;

let root: string;
let pluginFolder: string;
let folders: TestFolders;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "halonic-sessions-test-"));
  pluginFolder = join(root, "data", "plugins", "notes");
  await mkdir(join(pluginFolder, "server"), { recursive: true });
  await writeFile(join(pluginFolder, "plugin.yaml"), notesManifest);
  await writeFile(join(pluginFolder, "server", "main.js"), script);
  await mkdir(join(root, "launches"));
  folders = new TestFolders(join(root, "launches"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** The plugin as its trust check read it. */
function checked(): TrustedPluginFolder {
  return {
    location: pluginFolder,
    plugin,
    files: [
      { path: "plugin.yaml", sha256: sha256(notesManifest) },
      { path: "server/main.js", sha256: sha256(script) },
    ],
    fingerprint: trust.fingerprint,
  };
}

function sessionsWith(
  options: { settings?: PluginSettingValues; secrets?: TestSecrets } = {},
): PluginLocalToolSessions {
  return new PluginLocalToolSessions({
    folders,
    runners: noRunners,
    deniedPaths: [join(root, "data")],
    bridge: null,
    path: "/usr/bin",
    timeLimitMs: 60_000,
    http: noHttp,
    secrets: options.secrets ?? new TestSecrets(),
    settings: async () => options.settings ?? { root: "~/Notes" },
  });
}

verifies("connector-stdio-sandbox.plugin-local-tool-sessions", () => {
  it("starts the script from the session's copy, and the lookup gives the place the profile was built from", async () => {
    const secrets = new TestSecrets();
    const sessions = sessionsWith({ secrets });
    expect(sessions.localTools("notes:server")).toBeUndefined();

    const opening = await sessions.prepare(set, checked());

    const [copyFolder, workingFolder, tempFolder] = await folders.left();
    const copy = join(root, "launches", `${copyFolder}`, "plugin");
    expect(opening.config.transport).toMatchObject({
      kind: "stdio",
      command: "node",
      args: [join(copy, "server", "main.js")],
      env: { NOTES_ROOT: "~/Notes" },
      sites: ["notes.example.com"],
    });
    expect(await readFile(join(copy, "server", "main.js"), "utf8")).toBe(script);

    const setup = sessions.localTools("notes:server");
    expect(setup?.place).toMatchObject({
      workingFolder: join(root, "launches", `${workingFolder}`),
      tempFolder: join(root, "launches", `${tempFolder}`),
      readOnlyPaths: [copy],
      deniedPaths: [join(root, "data")],
      sites: ["notes.example.com"],
    });
    expect(setup?.tools.map((tool) => tool.name)).toEqual(["list-notes"]);
    expect(setup?.callTimeoutMs).toBe(5000);

    if (setup === undefined || opening.config.transport.kind !== "stdio")
      throw new Error("no setup");
    const expected = localToolLaunch(opening.config.transport, setup.place, null, {
      NOTES_KEY: "key-value",
    });
    expect(opening.profile).toEqual(expected.profile);
    expect(opening.profile.env["NOTES_KEY"]).toBe("key-value");
    expect(secrets.asked).toEqual(["plugin__notes__notes-key"]);
  });

  it("removes the session's folders and forgets its setup on release", async () => {
    const sessions = sessionsWith();
    const opening = await sessions.prepare(set, checked());
    expect(await folders.left()).toHaveLength(3);
    await opening.release?.();
    expect(await folders.left()).toEqual([]);
    expect(sessions.localTools("notes:server")).toBeUndefined();
  });

  it("keeps the next session's setup when an earlier session is released", async () => {
    const sessions = sessionsWith();
    const first = await sessions.prepare(set, checked());
    const second = await sessions.prepare(set, checked());
    await first.release?.();
    expect(sessions.localTools("notes:server")?.place.workingFolder).toBe(
      join(root, "launches", "launch-5"),
    );
    await second.release?.();
    expect(await folders.left()).toEqual([]);
  });

  describe("starts nothing and leaves no folder", () => {
    it("when the script changed after the trust check", async () => {
      await writeFile(join(pluginFolder, "server", "main.js"), "process.exit(1);\n");
      const sessions = sessionsWith();
      const refused = sessions.prepare(set, checked());
      await expect(refused).rejects.toThrow(PluginFileChangedError);
      await expect(refused).rejects.toMatchObject({ path: "server/main.js" });
      expect(await folders.left()).toEqual([]);
      expect(sessions.localTools("notes:server")).toBeUndefined();
    });

    it("when a required setting has no value", async () => {
      const sessions = sessionsWith({ settings: {} });
      const refused = sessions.prepare(set, checked());
      await expect(refused).rejects.toThrow(LocalToolSettingsNotSetError);
      await expect(refused).rejects.toMatchObject({ settings: ["root"] });
      // The plugin's connector names this part's reason, not a plain failure.
      expect(pluginPartUnavailableReason(await refused.catch((error: unknown) => error))).toEqual({
        kind: "settings-not-set",
        settings: ["root"],
      });
      expect(await folders.left()).toEqual([]);
    });

    it("when the plugin's secret isn't set", async () => {
      const secrets = new TestSecrets();
      secrets.get = async () => null;
      const sessions = sessionsWith({ secrets });
      await expect(sessions.prepare(set, checked())).rejects.toThrow("notes-key");
      expect(await folders.left()).toEqual([]);
    });
  });
});
