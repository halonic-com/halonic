import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import thisComputer, { join } from "node:path";
import { diskSettingsFolder, type SettingsFolderWriter } from "@halonicjs/adapter-harness-kit";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claudeCodeSettingsFiles,
  mcpSettingsFile,
  unfencedSettingsFile,
  writeClaudeCodeSettings,
} from "./settings.ts";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "claude-code-settings-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function readJson(name: string): Promise<unknown> {
  return JSON.parse(await readFile(join(folder, name), "utf8"));
}

/** The disk writer, counting what it writes. */
function countingWriter(): SettingsFolderWriter & { written: string[] } {
  const written: string[] = [];
  return {
    ...diskSettingsFolder,
    written,
    write: async (path, text) => {
      written.push(path);
      await diskSettingsFolder.write(path, text);
    },
  };
}

verifies("harness-claude-code.settings", () => {
  describe("writeClaudeCodeSettings", () => {
    it("turns Claude Code's own sandbox off and denies its web tools", async () => {
      await writeClaudeCodeSettings(folder, diskSettingsFolder, thisComputer);

      expect(await readJson("settings.json")).toEqual({
        sandbox: { enabled: false },
        permissions: {
          allow: [
            "mcp__halonic",
            "mcp__halonic-tools__read_ranges",
            "mcp__halonic-tools__search",
            "mcp__halonic-tools__repo_map",
          ],
          ask: ["mcp__halonic-tools__run_tests"],
          deny: ["WebFetch", "WebSearch"],
        },
      });
    });

    it("keeps Claude Code's own sandbox, for outside the fence, in a file of its own that asks for every command", async () => {
      await writeClaudeCodeSettings(folder, diskSettingsFolder, thisComputer);

      expect(await readJson(unfencedSettingsFile)).toEqual({
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: false,
          allowUnsandboxedCommands: false,
          failIfUnavailable: true,
        },
      });
    });

    it("names the bridge's MCP servers from the environment, with no token in any file", async () => {
      await writeClaudeCodeSettings(folder, diskSettingsFolder, thisComputer);

      // biome-ignore lint/suspicious/noTemplateCurlyInString: a variable Claude Code fills in, written literally
      const headers = { "x-halonic-run-token": "${HALONIC_RUN_TOKEN}" };
      expect(await readJson(mcpSettingsFile)).toEqual({
        mcpServers: {
          halonic: {
            type: "http",
            // biome-ignore lint/suspicious/noTemplateCurlyInString: a variable Claude Code fills in, written literally
            url: "${ANTHROPIC_BASE_URL}/mcp",
            headers,
          },
          "halonic-approvals": {
            type: "http",
            // biome-ignore lint/suspicious/noTemplateCurlyInString: a variable Claude Code fills in, written literally
            url: "${ANTHROPIC_BASE_URL}/mcp/permission-prompt",
            headers,
          },
        },
      });
    });

    it("writes the same files for every run, so no run's details end up in them", () => {
      expect(claudeCodeSettingsFiles()).toEqual(claudeCodeSettingsFiles());
      expect(Object.keys(claudeCodeSettingsFiles()).sort()).toEqual([
        mcpSettingsFile,
        unfencedSettingsFile,
        "settings.json",
      ]);
    });

    it("creates the settings folder when it doesn't exist yet", async () => {
      const inside = join(folder, "agents", "writer");
      await writeClaudeCodeSettings(inside, diskSettingsFolder, thisComputer);

      expect((await stat(join(inside, "settings.json"))).isFile()).toBe(true);
    });

    it("leaves files that already hold the settings alone", async () => {
      await writeClaudeCodeSettings(folder, diskSettingsFolder, thisComputer);
      const writer = countingWriter();

      await writeClaudeCodeSettings(folder, writer, thisComputer);
      expect(writer.written).toEqual([]);
    });

    it("replaces a settings file that holds something else, and leaves nothing aside", async () => {
      const writer = countingWriter();
      await diskSettingsFolder.write(join(folder, "settings.json"), "{}\n");

      await writeClaudeCodeSettings(folder, writer, thisComputer);
      expect(writer.written).toEqual([
        join(folder, "settings.json"),
        join(folder, mcpSettingsFile),
        join(folder, unfencedSettingsFile),
      ]);
      expect(await readJson("settings.json")).toMatchObject({ sandbox: { enabled: false } });
      expect((await readdir(folder)).sort()).toEqual([
        mcpSettingsFile,
        unfencedSettingsFile,
        "settings.json",
      ]);
    });
  });
});

verifies("harness-claude-code.settings-reset", () => {
  it("leaves only Halonic's files and the sign-in in the settings folder", async () => {
    const signIn = '{ "oauthAccount": { "emailAddress": "agent@acme.example" } }\n';
    await writeFile(join(folder, ".credentials.json"), signIn);
    await writeFile(join(folder, ".claude.json"), signIn);
    await writeFile(join(folder, "CLAUDE.md"), "notes\n");
    for (const name of ["skills", "agents", "commands"]) {
      await mkdir(join(folder, name, "notes"), { recursive: true });
      await writeFile(join(folder, name, "notes", "notes.md"), "notes\n");
    }

    await writeClaudeCodeSettings(folder, diskSettingsFolder, thisComputer);

    expect((await readdir(folder)).sort()).toEqual([
      ".claude.json",
      ".credentials.json",
      mcpSettingsFile,
      unfencedSettingsFile,
      "settings.json",
    ]);
    expect(await readFile(join(folder, ".credentials.json"), "utf8")).toBe(signIn);
    expect(await readFile(join(folder, ".claude.json"), "utf8")).toBe(signIn);
  });
});

verifies("harness-claude-code.settings-reset-claude-json", () => {
  const signIn = {
    oauthAccount: { emailAddress: "agent@acme.example" },
    primaryApiKey: "acme-stand-in",
    customApiKeyResponses: { approved: ["stand-in"], rejected: [] },
    userID: "acme-user",
    hasCompletedOnboarding: true,
  };

  it("keeps only the sign-in keys of .claude.json, dropping projects and the rest", async () => {
    const planted = {
      ...signIn,
      projects: { "/acme/repo": { allowedTools: ["Bash"] } },
      mcpServers: { acme: { type: "stdio", command: "acme" } },
    };
    await writeFile(join(folder, ".claude.json"), JSON.stringify(planted));

    await writeClaudeCodeSettings(folder, diskSettingsFolder, thisComputer);

    expect(await readJson(".claude.json")).toEqual(signIn);
  });

  it("writes the cut-down .claude.json for its owner only", async () => {
    await writeFile(join(folder, ".claude.json"), JSON.stringify({ ...signIn, projects: {} }), {
      mode: 0o644,
    });

    await writeClaudeCodeSettings(folder, diskSettingsFolder, thisComputer);

    expect(await readJson(".claude.json")).toEqual(signIn);
    // Windows has no POSIX file modes to check; the file still has to be cut down there.
    if (process.platform === "win32") return;
    expect((await stat(join(folder, ".claude.json"))).mode & 0o777).toBe(0o600);
  });

  it("leaves a .claude.json that holds only sign-in keys as it is", async () => {
    const text = JSON.stringify(signIn);
    await writeFile(join(folder, ".claude.json"), text);

    await writeClaudeCodeSettings(folder, diskSettingsFolder, thisComputer);

    expect(await readFile(join(folder, ".claude.json"), "utf8")).toBe(text);
  });

  it("removes a .claude.json that isn't a JSON object", async () => {
    await writeFile(join(folder, ".claude.json"), "[1, 2");

    await writeClaudeCodeSettings(folder, diskSettingsFolder, thisComputer);

    expect(await readdir(folder)).not.toContain(".claude.json");
  });
});
