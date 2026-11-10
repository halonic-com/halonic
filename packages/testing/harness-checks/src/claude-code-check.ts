import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  claudeCodeEnvironment,
  claudeProgram,
  findSignInProblem,
  type SignInProblem,
} from "@halonicjs/adapter-harness-claude-code";
import { harnessBridgeTokenHeader, type SandboxCommand } from "@halonicjs/ports";
import { readVersion } from "@halonicjs/std";
import {
  type BridgeSandbox,
  type BridgeSandboxOptions,
  type CheckedRun,
  openBridgeSandbox,
} from "./bridge-sandbox.ts";
import type { TappedRequest } from "./header-tap.ts";
import {
  type ClaudeSignInStorage,
  claudeCredentialsFile,
  claudeSignInStorage,
  type Keychain,
} from "./sign-in-storage.ts";

/** The variable `claude setup-token`'s long-lived sign-in goes in. */
export const oauthTokenVariable = "CLAUDE_CODE_OAUTH_TOKEN";

/** The headers that can carry a sign-in or key to Anthropic, and the bridge's own. */
export const claudeWatchedHeaders = ["authorization", "x-api-key", harnessBridgeTokenHeader];

/** Whether Claude Code says someone is signed in; `unknown` when its answer can't be read. */
export type SignedIn = "yes" | "no" | "unknown";

/** How one prompt through the bridge went, in facts a report may print. */
export interface PromptOutcome {
  /** `answered`: it finished; otherwise why not, as far as the check can tell. */
  result: "answered" | SignInProblem | "timed-out" | "failed";
  exitCode: number | null;
  /** What reached the bridge, by path and header name. */
  requests: TappedRequest[];
  /** The `host:port` of each connection the sandbox refused. */
  denied: string[];
  /** How many model calls the bridge answered and recorded. */
  modelCalls: number;
}

/** What the Claude Code check found. Nothing in it is a sign-in, a token or a person's account. */
export interface ClaudeCodeFindings {
  /** The `claude --version` number, or `null` when Claude Code didn't answer. */
  version: string | null;
  storage: ClaudeSignInStorage;
  /** Whether the check gave Claude Code `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`. */
  oauthTokenVariable: "passed" | "not-used";
  /** What `claude auth status` says outside the sandbox. */
  signedInOutside: SignedIn;
  /** What it says inside srt, with only the bridge reachable. */
  signedInInside: SignedIn;
  /** A one-word prompt inside srt, through the bridge. */
  prompt: PromptOutcome;
  /**
   * The same prompt with the sign-in's expiry set in the past, on a copy of
   * the settings folder, so Claude Code refreshes first. `not-forced` when
   * the check wasn't asked to; `not-possible` when the sign-in isn't in
   * `.credentials.json` (the Keychain's can't be changed safely).
   */
  refresh: PromptOutcome | "not-forced" | "not-possible";
}

/** Runs a program outside the sandbox, as the person, and gives back its exit code and output. */
export type AskOutside = (
  program: string,
  args: string[],
  env: Record<string, string>,
) => Promise<{ code: number | null; stdout: string }>;

/** What {@link checkClaudeCode} needs. */
export interface ClaudeCodeCheckOptions {
  /** The agent's settings folder (`CLAUDE_CONFIG_DIR`), where the person signed in. */
  settingsFolder: string;
  /** A folder of the check's own, which it may fill and the caller deletes. */
  scratchFolder: string;
  /** Whether to force a token refresh on a copy of the settings folder. */
  expireSignIn: boolean;
  /** The `claude setup-token` sign-in to pass in, from the person's environment; `undefined` passes none. */
  oauthToken: string | undefined;
  /** The person's own `PATH` and `HOME`, for the run outside the sandbox. */
  hostEnv: { PATH: string; HOME: string };
  keychain: Keychain;
  askOutside: AskOutside;
  /** How long one prompt may take before the check stops it. */
  promptTimeoutMs: number;
  /** Opens the bridge and the sandbox; the real ones unless a test gives others. */
  openSandbox?: (options: BridgeSandboxOptions) => Promise<BridgeSandbox>;
}

/** How long `claude auth status` and `claude --version` may take. */
const quickTimeoutMs = 60_000;

/** The prompt: short, with no tools to call, so one model call answers it. */
const prompt: SandboxCommand = {
  program: claudeProgram,
  args: ["-p", "--output-format", "json", "Reply with the single word: ok"],
};

/**
 * HAL-1710 checks 1 and 2 for Claude Code (requirement
 * `harness-checks.claude-code`): where its sign-in is kept, whether it can
 * read it inside srt, whether its model requests carry it to the bridge,
 * and where a refresh goes. The sandbox reaches only the bridge.
 */
export async function checkClaudeCode(
  options: ClaudeCodeCheckOptions,
): Promise<ClaudeCodeFindings> {
  const storage = await claudeSignInStorage(options.settingsFolder, options.keychain);
  const outside = await options.askOutside(claudeProgram, ["auth", "status"], {
    ...options.hostEnv,
    CLAUDE_CONFIG_DIR: options.settingsFolder,
    ...tokenEnv(options),
  });
  const main = await inSandbox(options, options.settingsFolder, "main", async (sandbox) => {
    const version = await sandbox.run(
      { program: claudeProgram, args: ["--version"] },
      quickTimeoutMs,
    );
    const status = await sandbox.run(
      { program: claudeProgram, args: ["auth", "status"] },
      quickTimeoutMs,
    );
    return {
      version: version.exit.code === 0 ? versionIn(version.stdout) : null,
      signedInInside: signedIn(status.exit.code, status.stdout),
      prompt: await promptOutcome(sandbox, options.promptTimeoutMs),
    };
  });
  return {
    version: main.version,
    storage,
    oauthTokenVariable: options.oauthToken === undefined ? "not-used" : "passed",
    signedInOutside: signedIn(outside.code, outside.stdout),
    signedInInside: main.signedInInside,
    prompt: main.prompt,
    refresh: await refreshOutcome(options, storage),
  };
}

/** The prompt again on a copy of the settings folder whose sign-in has expired, when asked for and possible. */
async function refreshOutcome(
  options: ClaudeCodeCheckOptions,
  storage: ClaudeSignInStorage,
): Promise<ClaudeCodeFindings["refresh"]> {
  if (!options.expireSignIn) return "not-forced";
  if (storage.credentialsFile === "absent") return "not-possible";
  const copy = join(options.scratchFolder, "settings-expired");
  await cp(options.settingsFolder, copy, { recursive: true });
  if (!(await expireCredentials(join(copy, claudeCredentialsFile)))) return "not-possible";
  return inSandbox(options, copy, "refresh", (sandbox) =>
    promptOutcome(sandbox, options.promptTimeoutMs),
  );
}

/**
 * Sets the expiry of the sign-in in a copied `.credentials.json` a minute in
 * the past, so Claude Code refreshes before its first model call. Only the
 * `expiresAt` number changes; nothing in the file is printed.
 *
 * @returns false when the file has no `claudeAiOauth.expiresAt` to change
 */
export async function expireCredentials(file: string, now = Date.now()): Promise<boolean> {
  const credentials: unknown = JSON.parse(await readFile(file, "utf8"));
  const oauth =
    typeof credentials === "object" && credentials !== null && "claudeAiOauth" in credentials
      ? credentials.claudeAiOauth
      : undefined;
  if (typeof oauth !== "object" || oauth === null || !("expiresAt" in oauth)) return false;
  if (typeof oauth.expiresAt !== "number") return false;
  Object.assign(oauth, { expiresAt: now - 60_000 });
  await writeFile(file, JSON.stringify(credentials), { mode: 0o600 });
  return true;
}

/** Opens a bridge and a sandbox for one settings folder, runs `use`, and closes both. */
async function inSandbox<T>(
  options: ClaudeCodeCheckOptions,
  settingsFolder: string,
  name: string,
  use: (sandbox: BridgeSandbox) => Promise<T>,
): Promise<T> {
  const open = options.openSandbox ?? openBridgeSandbox;
  const sandbox = await open({
    provider: "anthropic",
    watched: claudeWatchedHeaders,
    environment: (bridge, folders) => claudeCodeEnvironment(bridge, folders),
    settingsFolder,
    scratchFolder: join(options.scratchFolder, name),
    allowedSites: [],
    extraEnv: tokenEnv(options),
  });
  try {
    return await use(sandbox);
  } finally {
    await sandbox.close();
  }
}

async function promptOutcome(sandbox: BridgeSandbox, timeoutMs: number): Promise<PromptOutcome> {
  // Only what the prompt itself caused, not the quick questions before it.
  const before = {
    requests: sandbox.requests.length,
    denied: sandbox.denied.length,
    modelCalls: sandbox.modelCalls,
  };
  const run = await sandbox.run(prompt, timeoutMs);
  return {
    result: promptResult(run),
    exitCode: run.exit.code,
    requests: sandbox.requests.slice(before.requests),
    denied: sandbox.denied.slice(before.denied),
    modelCalls: sandbox.modelCalls - before.modelCalls,
  };
}

/** How the prompt ended: answered, a sign-in problem Claude Code printed, stopped, or another failure. */
export function promptResult(run: CheckedRun): PromptOutcome["result"] {
  if (run.exit.timedOut) return "timed-out";
  if (run.exit.code === 0 && !resultIsError(run.stdout)) return "answered";
  const lines = [
    ...run.stdout.split(/\r?\n/),
    ...run.stderr.split(/\r?\n/),
    resultText(run.stdout),
  ];
  for (const line of lines) {
    const problem = findSignInProblem(line);
    if (problem !== undefined) return problem;
  }
  return "failed";
}

/** The `is_error` of `--output-format json`'s answer. */
function resultIsError(stdout: string): boolean {
  return readJsonObject(stdout)?.["is_error"] === true;
}

/** The `result` text of `--output-format json`'s answer, or "" when there is none. */
function resultText(stdout: string): string {
  const result = readJsonObject(stdout)?.["result"];
  return typeof result === "string" ? result : "";
}

/**
 * What `claude auth status` says, from its exit code and its `loggedIn`
 * field. Only these two are read: the rest can name the person's account.
 */
export function signedIn(code: number | null, stdout: string): SignedIn {
  const loggedIn = readJsonObject(stdout)?.["loggedIn"];
  if (code === 0 && loggedIn === true) return "yes";
  if (code === 1 && loggedIn === false) return "no";
  return "unknown";
}

/** The version number in `claude --version`'s answer, such as "2.3.1 (Claude Code)". */
function versionIn(stdout: string): string | null {
  const word = stdout.trim().split(/\s+/)[0] ?? "";
  return readVersion(word) === undefined ? null : word;
}

function readJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function tokenEnv(options: ClaudeCodeCheckOptions): Record<string, string> {
  return options.oauthToken === undefined ? {} : { [oauthTokenVariable]: options.oauthToken };
}
