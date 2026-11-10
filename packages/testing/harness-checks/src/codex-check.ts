import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  codexConfigArgs,
  codexConfigFile,
  codexConfigText,
  codexEnvironment,
  codexProgram,
  saysSignedOut,
} from "@halonicjs/adapter-harness-codex";
import { harnessBridgeTokenHeader, type SandboxCommand } from "@halonicjs/ports";
import { readVersion } from "@halonicjs/std";
import type { AskOutside, OutsideAnswer } from "./ask-outside.ts";
import type { BridgeSandbox, BridgeSandboxOptions, CheckedRun } from "./bridge-sandbox.ts";
import {
  type OpenSandbox,
  type PromptOutcome,
  type PromptResult,
  promptOutcome,
  type RefreshOutcome,
  type SignedIn,
  withSandbox,
} from "./prompt-outcome.ts";
import {
  codexSignInPlace,
  type Keychain,
  type SignInStorage,
  signInStorage,
} from "./sign-in-storage.ts";

/** The headers that can carry a ChatGPT sign-in or key to OpenAI, and the bridge's own. */
export const codexWatchedHeaders = [
  "authorization",
  "chatgpt-account-id",
  harnessBridgeTokenHeader,
];

/**
 * What kind of sign-in `auth.json` holds, by which fields are there:
 * `chatgpt` when it has ChatGPT tokens, `api-key` when it has an API key,
 * `neither`, or `no-file`. No field's value is read.
 */
export type CodexSignInKind = "chatgpt" | "api-key" | "neither" | "no-file";

/** What the Codex check found. Nothing in it is a sign-in, a token or a person's account. */
export interface CodexFindings {
  /** The `codex --version` number, or `null` when Codex didn't answer. */
  version: string | null;
  storage: SignInStorage;
  signInKind: CodexSignInKind;
  /** What `codex login status` says outside the sandbox. */
  signedInOutside: SignedIn;
  /** What it says inside srt, with only the bridge reachable. */
  signedInInside: SignedIn;
  /** A one-word prompt inside srt, through the bridge. */
  prompt: PromptOutcome;
  /**
   * The same prompt with the sign-in's last refresh set long ago, on a copy
   * of the settings folder. `not-possible` when `auth.json` holds no
   * ChatGPT sign-in (a Keychain sign-in can't be changed safely).
   */
  refresh: RefreshOutcome;
}

/** What {@link checkCodex} needs. */
export interface CodexCheckOptions {
  /** The agent's settings folder (`CODEX_HOME`), where the person signed in. */
  settingsFolder: string;
  /** A folder of the check's own, which it may fill and the caller deletes. */
  scratchFolder: string;
  /** Whether to force a token refresh on a copy of the settings folder. */
  expireSignIn: boolean;
  /** The person's own `PATH` and `HOME`, for the run outside the sandbox. */
  hostEnv: { PATH: string; HOME: string };
  keychain: Keychain;
  askOutside: AskOutside;
  /** How long one prompt may take before the check stops it. */
  promptTimeoutMs: number;
  /** Opens the bridge and the sandbox; the real ones unless a test gives others. */
  openSandbox?: OpenSandbox;
}

/** How long `codex login status` and `codex --version` may take. */
const quickTimeoutMs = 60_000;

/** The word Codex prints before its version: `codex-cli 0.166.0`. */
const versionPrefix = "codex-cli";

/**
 * How long ago the check sets the last refresh. Codex refreshes a ChatGPT
 * sign-in whose `last_refresh` is older than its refresh interval (8 days
 * in the Codex source read for this check), so 30 days is past it.
 */
const longAgoMs = 30 * 24 * 60 * 60_000;

/**
 * HAL-1710 check 1 for Codex (requirement `harness-checks.codex`): where its
 * sign-in is kept, whether it can read it inside srt, whether a ChatGPT
 * sign-in follows the bridge's address as a custom provider's base URL,
 * and where a refresh goes. Codex gets the `config.toml` and the `-c`
 * arguments its adapter gives it; the sandbox reaches only the bridge.
 */
export async function checkCodex(options: CodexCheckOptions): Promise<CodexFindings> {
  const storage = await signInStorage(options.settingsFolder, codexSignInPlace, options.keychain);
  const signInKind = await codexSignInKind(join(options.settingsFolder, codexSignInPlace.file));
  const outside = await options.askOutside(codexProgram, ["login", "status"], {
    ...options.hostEnv,
    CODEX_HOME: options.settingsFolder,
  });
  // Halonic writes its `config.toml` before every run of the agent; the
  // check does too, and puts the person's file back afterwards.
  return withSettingsFile(
    join(options.settingsFolder, codexConfigFile),
    codexConfigText(),
    async () => {
      const main = await inSandbox(options, options.settingsFolder, "main", async (sandbox) => {
        const version = await sandbox.run(
          { program: codexProgram, args: ["--version"] },
          quickTimeoutMs,
        );
        const status = await sandbox.run(
          { program: codexProgram, args: ["login", "status"] },
          quickTimeoutMs,
        );
        return {
          version: version.exit.code === 0 ? versionIn(version.stdout) : null,
          signedInInside: signedIn(answerOf(status)),
          prompt: await codexPrompt(sandbox, options.promptTimeoutMs),
        };
      });
      return {
        version: main.version,
        storage,
        signInKind,
        signedInOutside: signedIn(outside),
        signedInInside: main.signedInInside,
        prompt: main.prompt,
        refresh: await refreshOutcome(options, signInKind),
      };
    },
  );
}

/** The prompt again on a copy of the settings folder whose sign-in is due a refresh, when asked for and possible. */
async function refreshOutcome(
  options: CodexCheckOptions,
  signInKind: CodexSignInKind,
): Promise<RefreshOutcome> {
  if (!options.expireSignIn) return "not-forced";
  if (signInKind !== "chatgpt") return "not-possible";
  // The copy holds the check's `config.toml` too: it is made while that file is in place.
  const copy = join(options.scratchFolder, "settings-expired");
  await cp(options.settingsFolder, copy, { recursive: true });
  if (!(await ageSignIn(join(copy, codexSignInPlace.file)))) return "not-possible";
  return inSandbox(options, copy, "refresh", (sandbox) =>
    codexPrompt(sandbox, options.promptTimeoutMs),
  );
}

/** Which kind of sign-in `auth.json` holds, by the fields that are there. */
export async function codexSignInKind(file: string): Promise<CodexSignInKind> {
  const auth = await readJsonFile(file);
  if (auth === undefined) return "no-file";
  if (isObject(auth["tokens"])) return "chatgpt";
  if (typeof auth["OPENAI_API_KEY"] === "string") return "api-key";
  return "neither";
}

/**
 * Sets `last_refresh` in a copied `auth.json` to 30 days before `now`, so
 * Codex refreshes the ChatGPT sign-in before its first model call. Only
 * that time changes; nothing in the file is printed.
 *
 * @returns false when the file has no ChatGPT tokens or no `last_refresh` to change
 */
export async function ageSignIn(file: string, now = Date.now()): Promise<boolean> {
  const auth = await readJsonFile(file);
  if (auth === undefined || !isObject(auth["tokens"])) return false;
  if (typeof auth["last_refresh"] !== "string") return false;
  auth["last_refresh"] = new Date(now - longAgoMs).toISOString();
  await writeFile(file, JSON.stringify(auth), { mode: 0o600 });
  return true;
}

/**
 * Writes `text` to `file` for the time `use` runs, then puts back what was
 * there before, or removes the file when there was none.
 */
export async function withSettingsFile<T>(
  file: string,
  text: string,
  use: () => Promise<T>,
): Promise<T> {
  const before = await readFile(file, "utf8").catch(() => null);
  await writeFile(file, text);
  try {
    return await use();
  } finally {
    if (before === null) await rm(file, { force: true });
    else await writeFile(file, before);
  }
}

/** Opens a bridge and a sandbox for Codex with one settings folder, runs `use`, and closes both. */
function inSandbox<T>(
  options: CodexCheckOptions,
  settingsFolder: string,
  name: string,
  use: (sandbox: BridgeSandbox) => Promise<T>,
): Promise<T> {
  const sandbox: BridgeSandboxOptions = {
    provider: "openai",
    watched: codexWatchedHeaders,
    environment: (bridge, folders) => codexEnvironment(bridge, folders),
    settingsFolder,
    scratchFolder: join(options.scratchFolder, name),
    allowedSites: [],
  };
  return withSandbox(sandbox, use, options.openSandbox);
}

/**
 * The prompt: short, with no tools to call, so one model call answers it.
 * The bridge's address goes on the command line, as the adapter gives it.
 */
export function codexPromptCommand(bridgeUrl: string): SandboxCommand {
  return {
    program: codexProgram,
    args: [
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--json",
      ...codexConfigArgs({ url: bridgeUrl }),
      "Reply with the single word: ok",
    ],
  };
}

function codexPrompt(sandbox: BridgeSandbox, timeoutMs: number): Promise<PromptOutcome> {
  return promptOutcome(sandbox, codexPromptCommand(sandbox.bridgeUrl), timeoutMs, promptResult);
}

/** How the prompt ended: answered, signed out, stopped, or another failure. */
export function promptResult(run: CheckedRun): PromptResult {
  if (run.exit.timedOut) return "timed-out";
  if (run.exit.code === 0 && !turnFailed(run.stdout)) return "answered";
  if (signedIn(answerOf(run)) === "no") return "signed-out";
  return "failed";
}

/** Whether `codex exec --json` printed an event saying the turn failed. Only each event's `type` is read. */
function turnFailed(stdout: string): boolean {
  return stdout.split(/\r?\n/).some((line) => {
    const type = readJsonObject(line)?.["type"];
    return type === "turn.failed" || type === "error";
  });
}

/**
 * What `codex login status` says, from its exit code and its "Not logged
 * in" line, as the adapter reads it. The rest of its answer can show part
 * of a key or name the sign-in method, so it isn't read.
 */
export function signedIn(answer: OutsideAnswer): SignedIn {
  if (answer.code === 0) return "yes";
  if (saysSignedOut({ status: "ran", path: codexProgram, ...answer })) return "no";
  return "unknown";
}

/** A run in the sandbox as an answer {@link signedIn} reads. */
function answerOf(run: CheckedRun): OutsideAnswer {
  return { code: run.exit.code, stdout: run.stdout, stderr: run.stderr };
}

/** The version number in `codex --version`'s answer, such as "codex-cli 0.166.0". */
function versionIn(stdout: string): string | null {
  const [prefix, word = ""] = stdout.trim().split(/\s+/);
  return prefix === versionPrefix && readVersion(word) !== undefined ? word : null;
}

async function readJsonFile(file: string): Promise<Record<string, unknown> | undefined> {
  const text = await readFile(file, "utf8").catch(() => null);
  return text === null ? undefined : readJsonObject(text);
}

function readJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
