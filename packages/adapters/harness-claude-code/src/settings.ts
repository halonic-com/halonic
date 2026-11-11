import { type SettingsFolderWriter, writeSettingsFiles } from "@halonicjs/adapter-harness-kit";
import { harnessBridgeTokenHeader } from "@halonicjs/ports";
import { bridgeServerName, permissionServerName } from "./bridge-tools.ts";
import { claudeCodeRunTokenVariable } from "./environment.ts";

/** The file in the settings folder that names the bridge's MCP server; Claude Code reads it with `--mcp-config`. */
export const mcpSettingsFile = "halonic-mcp.json";

/** The tool on the bridge Claude Code asks when a tool call needs an OK (`--permission-prompt-tool`). */
export const permissionPromptTool = `mcp__${permissionServerName}__approve_permission`;

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
 *
 * Halonic's tools are allowed without Claude Code's own prompt: the bridge
 * checks each call and asks a person itself when the agent's file says so,
 * so asking in Claude Code too would ask the person twice.
 */
function claudeCodeSettings(): object {
  return {
    sandbox: { enabled: false },
    permissions: { allow: [`mcp__${bridgeServerName}`], deny: [...deniedClaudeCodeTools] },
  };
}

/**
 * The bridge's two MCP servers: Halonic's tools at `/mcp` on the bridge's
 * address, and the permission prompt at `/mcp/permission-prompt`, each with
 * the run token in the bridge's header. Both come from the environment
 * (`ANTHROPIC_BASE_URL` and {@link claudeCodeRunTokenVariable}), which
 * Claude Code fills in when it reads the file, so the file is the same for
 * every run and holds no secret.
 */
function mcpSettings(): object {
  return {
    mcpServers: {
      [bridgeServerName]: bridgeMcpServer("/mcp"),
      [permissionServerName]: bridgeMcpServer("/mcp/permission-prompt"),
    },
  };
}

/** One MCP server on the bridge, at `path` on its address. */
function bridgeMcpServer(path: string): object {
  return {
    type: "http",
    url: `${variable("ANTHROPIC_BASE_URL")}${path}`,
    headers: { [harnessBridgeTokenHeader]: variable(claudeCodeRunTokenVariable) },
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

/**
 * Writes {@link claudeCodeSettingsFiles} into `folder`, leaving a file that
 * already holds the same text alone.
 */
export async function writeClaudeCodeSettings(
  folder: string,
  writer: SettingsFolderWriter,
): Promise<void> {
  await writeSettingsFiles(folder, claudeCodeSettingsFiles(), writer);
}
