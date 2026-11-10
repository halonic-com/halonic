import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claudeCodeSettingsFiles,
  diskSettingsFolder,
  mcpSettingsFile,
  type SettingsFolderWriter,
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
        permissions: { deny: ["WebFetch", "WebSearch"] },
      });
    });

    it("names the bridge's MCP server from the environment, with no token in any file", async () => {
      await writeClaudeCodeSettings(folder, diskSettingsFolder);

      expect(await readJson(mcpSettingsFile)).toEqual({
        mcpServers: {
          halonic: {
            type: "http",
            // biome-ignore lint/suspicious/noTemplateCurlyInString: a variable Claude Code fills in, written literally
            url: "${ANTHROPIC_BASE_URL}/mcp",
            // biome-ignore lint/suspicious/noTemplateCurlyInString: a variable Claude Code fills in, written literally
            headers: { "x-halonic-run-token": "${HALONIC_RUN_TOKEN}" },
          },
        },
      });
    });

    it("writes the same files for every run, so no run's details end up in them", () => {
      expect(claudeCodeSettingsFiles()).toEqual(claudeCodeSettingsFiles());
      expect(Object.keys(claudeCodeSettingsFiles()).sort()).toEqual([
        mcpSettingsFile,
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
      ]);
      expect(await readJson("settings.json")).toMatchObject({ sandbox: { enabled: false } });
      expect((await readdir(folder)).sort()).toEqual([mcpSettingsFile, "settings.json"]);
    });
  });
});
