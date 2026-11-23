import { join } from "node:path";
import { type FakeProgram, FakeSandboxSession } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { codexConfigText, codexPinnedSettingsArgs } from "./config.ts";
import { codexFinishing, MemorySettingsFolder } from "./fake-codex.test-helper.ts";
import {
  bridge,
  engineProfile,
  engineSessionOptions,
  newHarness,
  readAll,
  task,
} from "./harness-run.test-helper.ts";

/** A session opened the way the engine opens one, running `program` as `codex`. */
function openSession(program: FakeProgram, profile = engineProfile): FakeSandboxSession {
  return new FakeSandboxSession(engineSessionOptions(program, profile));
}

const settingsFolder = "/agents/writer/settings";

/** The `-c` settings of `args`, by key. */
function settingsOf(args: readonly string[]): Map<string, string> {
  const settings = new Map<string, string>();
  args.forEach((arg, index) => {
    const setting = args[index + 1];
    if (arg !== "-c" || setting === undefined) return;
    const equals = setting.indexOf("=");
    settings.set(setting.slice(0, equals), setting.slice(equals + 1));
  });
  return settings;
}

verifies("harness-codex.pinned-settings", () => {
  describe("codexPinnedSettingsArgs", () => {
    it("sets the provider, approvals, web search and the token headers, without the token", () => {
      const settings = settingsOf(codexPinnedSettingsArgs());

      expect(settings.get("model_provider")).toBe('"halonic"');
      expect(settings.get("approval_policy")).toBe('"on-request"');
      expect(settings.get("web_search")).toBe('"disabled"');
      expect(settings.get("model_providers.halonic.wire_api")).toBe('"responses"');
      expect(settings.get("model_providers.halonic.requires_openai_auth")).toBe("true");
      const header = '{"x-halonic-run-token"="HALONIC_RUN_TOKEN"}';
      expect(settings.get("model_providers.halonic.env_http_headers")).toBe(header);
      expect(settings.get("mcp_servers.halonic.env_http_headers")).toBe(header);
      expect(codexPinnedSettingsArgs().join(" ")).not.toContain(bridge.token);
    });
  });

  describe("codexHarness: a project's own Codex settings", () => {
    it("passes the pinned settings to every run", async () => {
      const session = openSession(codexFinishing);
      await readAll(newHarness().start(task, session, bridge));

      expect(session.started[0]?.args).toEqual(expect.arrayContaining(codexPinnedSettingsArgs()));
    });

    it("refuses to start when the working folder holds .codex/config.toml", async () => {
      const disk = new MemorySettingsFolder();
      const path = join(engineProfile.workingFolder, ".codex", "config.toml");
      disk.files.set(path, 'approval_policy = "never"\n');
      const session = openSession(codexFinishing);
      const { error } = await readAll(newHarness(disk).start(task, session, bridge));

      expect(String(error)).toContain(path);
      expect(session.started).toEqual([]);
      expect(disk.files.has(join(settingsFolder, "config.toml"))).toBe(false);
    });

    it("refuses to start when the project's root above the working folder holds one", async () => {
      const disk = new MemorySettingsFolder();
      disk.files.set(join("/agents", ".git", "HEAD"), "ref: refs/heads/main\n");
      disk.files.set(join("/agents", ".codex", "config.toml"), "");
      const session = openSession(codexFinishing);
      const { error } = await readAll(newHarness(disk).start(task, session, bridge));

      expect(String(error)).toContain(join("/agents", ".codex", "config.toml"));
      expect(session.started).toEqual([]);
    });

    it("starts when the only one is above the project's root", async () => {
      const disk = new MemorySettingsFolder();
      disk.files.set(join("/agents", "writer", ".git", "HEAD"), "ref: refs/heads/main\n");
      disk.files.set(join("/agents", ".codex", "config.toml"), "");
      const session = openSession(codexFinishing);
      const { error } = await readAll(newHarness(disk).start(task, session, bridge));

      expect(error).toBeUndefined();
      expect(session.started).toHaveLength(1);
    });
  });
});

verifies("harness-codex.settings-reset", () => {
  it("leaves only config.toml and the sign-in in the settings folder before codex starts", async () => {
    const disk = new MemorySettingsFolder();
    const signIn = '{ "account": "acme" }\n';
    disk.files.set(join(settingsFolder, "auth.json"), signIn);
    disk.files.set(join(settingsFolder, "AGENTS.md"), "notes\n");
    disk.files.set(join(settingsFolder, "rules", "default.rules"), "notes\n");
    disk.files.set(join(settingsFolder, "skills", "notes", "SKILL.md"), "notes\n");
    let namesWhenStarted: string[] = [];
    const session = openSession(async (io) => {
      namesWhenStarted = (await disk.list(settingsFolder)).sort();
      return codexFinishing(io);
    });
    await readAll(newHarness(disk).start(task, session, bridge));

    expect(namesWhenStarted).toEqual(["auth.json", "config.toml"]);
    expect(disk.files.get(join(settingsFolder, "auth.json"))).toBe(signIn);
    expect(disk.files.get(join(settingsFolder, "config.toml"))).toBe(codexConfigText());
  });
});
