import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    written,
    read: (path) => diskSettingsFolder.read(path),
    write: async (path, text) => {
      written.push(path);
      await diskSettingsFolder.write(path, text);
    },
  };
}

verifies("harness-claude-code.settings", () => {
  describe("writeClaudeCodeSettings", () => {
    it("turns Claude Code's own sandbox off and denies its web tools", async () => {
      await writeClaudeCodeSettings(folder, diskSettingsFolder);

      expect(await readJson("settings.json")).toEqual({
        sandbox: { enabled: false },
        permissions: { allow: ["mcp__halonic"], deny: ["WebFetch", "WebSearch"] },
      });
    });

    it("keeps Claude Code's own sandbox, for outside the fence, in a file of its own that asks for every command", async () => {
      await writeClaudeCodeSettings(folder, diskSettingsFolder);

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
      await writeClaudeCodeSettings(folder, diskSettingsFolder);

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
      await writeClaudeCodeSettings(inside, diskSettingsFolder);

      expect((await stat(join(inside, "settings.json"))).isFile()).toBe(true);
    });

    it("leaves files that already hold the settings alone", async () => {
      await writeClaudeCodeSettings(folder, diskSettingsFolder);
      const writer = countingWriter();

      await writeClaudeCodeSettings(folder, writer);
      expect(writer.written).toEqual([]);
    });

    it("replaces a settings file that holds something else, and leaves nothing aside", async () => {
      const writer = countingWriter();
      await diskSettingsFolder.write(join(folder, "settings.json"), "{}\n");

      await writeClaudeCodeSettings(folder, writer);
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
