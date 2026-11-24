import {
  askingCodingTools,
  type CodingToolsCommand,
  codingToolsServerName,
  type HostPaths,
  readOnlyCodingTools,
  resetSettingsFolderWith,
  type SettingsFolderWriter,
} from "@halonicjs/adapter-harness-kit/web";
import { harnessBridgeTokenHeader } from "@halonicjs/ports";
import { bridgeServerName, permissionServerName } from "./bridge-tools.ts";
import { claudeJsonFile, keepClaudeJsonSignIn } from "./claude-json.ts";
import { claudeCodeRunTokenVariable } from "./environment.ts";

/** The file in the settings folder that names the bridge's MCP server; Claude Code reads it with `--mcp-config`. */
export const mcpSettingsFile = "halonic-mcp.json";

/**
 * The file in the settings folder that turns Claude Code's own sandbox on;
 * Claude Code reads it with `--settings`, which the run passes only outside
 * Halonic's fence, where Claude Code's sandbox works (`unfencedSettings`).
 */
export const unfencedSettingsFile = "halonic-unfenced.json";

/**
 * The file in the session's temp folder that names the coding tools
 * server, for a fenced run only; the command adds it as a second
 * `--mcp-config`. It is the run's own, because the server's command names
 * the run's temp folder. The program may write that folder, but Claude Code
 * reads `--mcp-config` only when it starts, before the program can run
 * anything, so a later change to the file names no other server.
 */
export const codingToolsSettingsFile = "halonic-tools-mcp.json";

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
 * `settings.json`: Claude Code's own sandbox is off inside Halonic's fence,
 * because Halonic's sandbox is already around it and the two don't nest
 * (wherever the fence isn't proven, {@link unfencedSettings} turns it on), and its web tools
 * are denied. A deny rule wins over any allow rule a project adds.
 *
 * Halonic's tools are allowed without Claude Code's own prompt: the bridge
 * checks each call and asks a person itself when the agent's file says so,
 * so asking in Claude Code too would ask the person twice.
 *
 * The coding tools server's read-only tools are allowed, as Claude Code's
 * own `Read` is. `run_tests` has an `ask` rule: in Claude Code an `ask` rule
 * wins over every `allow` rule, so no allow rule, from any settings file or
 * from an "always allow" answer, lets a call skip the person's approval card.
 */
function claudeCodeSettings(): object {
  return {
    sandbox: { enabled: false },
    permissions: {
      allow: [
        `mcp__${bridgeServerName}`,
        ...readOnlyCodingTools.map((tool) => `mcp__${codingToolsServerName}__${tool}`),
      ],
      ask: askingCodingTools.map((tool) => `mcp__${codingToolsServerName}__${tool}`),
      deny: [...deniedClaudeCodeTools],
    },
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
 * {@link unfencedSettingsFile}: Claude Code's own sandbox, for a run outside
 * Halonic's fence. Its shell commands run in it, and still ask for an OK
 * (`autoAllowBashIfSandboxed: false`), so every command still reaches
 * Halonic's approval card. A command is refused, not run without the
 * sandbox, when the sandbox can't start (`failIfUnavailable`) or when
 * Claude Code asks to run it outside (`allowUnsandboxedCommands: false`).
 */
function unfencedSettings(): object {
  return {
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: false,
      allowUnsandboxedCommands: false,
      failIfUnavailable: true,
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
    [unfencedSettingsFile]: jsonFile(unfencedSettings()),
  };
}

/**
 * {@link codingToolsSettingsFile}'s text: the coding tools server, started
 * by Claude Code as its own child over standard input and output, so it runs
 * inside the same fence (requirement `harness-claude-code.coding-tools`).
 */
export function codingToolsSettings(command: CodingToolsCommand): string {
  return jsonFile({
    mcpServers: {
      [codingToolsServerName]: { type: "stdio", command: command.command, args: command.args },
    },
  });
}

/** How a Claude Code MCP setting names an environment variable, for Claude Code to fill in: `${NAME}`. */
function variable(name: string): string {
  return `\${${name}}`;
}

function jsonFile(value: object): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * The files in the settings folder that hold the agent's own Claude Code
 * sign-in: the stored sign-in (on macOS it is in the keychain instead) and
 * Claude Code's own file, which holds the account and a Console key. They
 * stay when the folder is reset before a run (`harness-claude-code.settings-reset`);
 * the second keeps only its sign-in keys.
 */
export const claudeCodeSignInFiles: readonly string[] = [".credentials.json", claudeJsonFile];

/**
 * Resets `folder` to {@link claudeCodeSettingsFiles} and
 * {@link claudeCodeSignInFiles}: everything else in it goes, such as a
 * user-level `CLAUDE.md`, `skills/`, `agents/` or `commands/` a run left
 * there, and `.claude.json` keeps only its sign-in keys. A settings file
 * that already holds the same text is left alone.
 */
export async function writeClaudeCodeSettings(
  folder: string,
  writer: SettingsFolderWriter,
  paths: Pick<HostPaths, "join">,
): Promise<void> {
  const contents = { files: claudeCodeSettingsFiles(), signIn: claudeCodeSignInFiles };
  await resetSettingsFolderWith(paths, folder, contents, writer);
  await keepClaudeJsonSignIn(paths, folder, writer);
}
