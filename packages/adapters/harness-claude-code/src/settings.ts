import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { harnessBridgeTokenHeader } from "@halonicjs/ports";
import { bridgeServerName } from "./bridge-tools.ts";

/**
 * The variable that carries the run token for the bridge's MCP server. The
 * MCP settings name it in the server's header, and Claude Code fills it in
 * from its environment, so the token is never written into a file.
 */
export const claudeCodeRunTokenVariable = "HALONIC_RUN_TOKEN";

/** The file in the settings folder that names the bridge's MCP server; Claude Code reads it with `--mcp-config`. */
export const mcpSettingsFile = "halonic-mcp.json";

/** The tool on the bridge Claude Code asks when a tool call needs an OK (`--permission-prompt-tool`). */
export const permissionPromptTool = `mcp__${bridgeServerName}__approve_permission`;

/**
 * Claude Code's own tools that fetch from the web. Halonic denies them in a
 * sandbox and on this computer alike (decision 7, HAL-2076): the agent
 * reaches the web only through Halonic's tools, where trust and approvals
 * apply.
 */
export const deniedClaudeCodeTools: readonly string[] = ["WebFetch", "WebSearch"];

/**
 * `settings.json`: Claude Code's own sandbox is off, because Halonic's
 * sandbox is already around it and the two don't nest, and its web tools
 * are denied. A deny rule wins over any allow rule a project adds.
 */
function claudeCodeSettings(): object {
  return {
    sandbox: { enabled: false },
    permissions: { deny: [...deniedClaudeCodeTools] },
  };
}

/**
 * The bridge's MCP server, at `/mcp` on the bridge's address, with the run
 * token in the bridge's header. Both come from the environment
 * (`ANTHROPIC_BASE_URL` and {@link claudeCodeRunTokenVariable}), which
 * Claude Code fills in when it reads the file, so the file is the same for
 * every run and holds no secret.
 */
function mcpSettings(): object {
  return {
    mcpServers: {
      [bridgeServerName]: {
        type: "http",
        url: `${variable("ANTHROPIC_BASE_URL")}/mcp`,
        headers: { [harnessBridgeTokenHeader]: variable(claudeCodeRunTokenVariable) },
      },
    },
  };
}

/**
 * The files the harness writes to the agent's settings folder
 * (requirement `harness-claude-code.settings`), by file name. They don't
 * depend on the run or on where it runs, so two runs of one agent write the
 * same text.
 */
export function claudeCodeSettingsFiles(): Readonly<Record<string, string>> {
  return {
    "settings.json": jsonFile(claudeCodeSettings()),
    [mcpSettingsFile]: jsonFile(mcpSettings()),
  };
}

/** How a Claude Code MCP setting names an environment variable, for Claude Code to fill in: `${NAME}`. */
function variable(name: string): string {
  return `\${${name}}`;
}

function jsonFile(value: object): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Where the harness writes its files (the settings folder, and a run's instructions file): this computer's disk, or a fake in tests. */
export interface SettingsFolderWriter {
  /** The file's text, or `null` when there is no such file. */
  read(path: string): Promise<string | null>;
  /** Writes `text` to the file, creating its folder. A reader sees the old text or the new, never a part. */
  write(path: string, text: string): Promise<void>;
}

/**
 * Writes {@link claudeCodeSettingsFiles} into `folder`. A file that already
 * holds the same text is left alone: Claude Code watches its settings, and
 * another run of the agent may be reading them.
 */
export async function writeClaudeCodeSettings(
  folder: string,
  writer: SettingsFolderWriter,
): Promise<void> {
  for (const [name, text] of Object.entries(claudeCodeSettingsFiles())) {
    const path = join(folder, name);
    if ((await writer.read(path)) === text) continue;
    await writer.write(path, text);
  }
}

/** Writes settings files on this computer's disk. Each file is written aside and then renamed into place. */
export const diskSettingsFolder: SettingsFolderWriter = {
  async read(path) {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  },
  async write(path, text) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(temporary, text, "utf8");
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  },
};

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
