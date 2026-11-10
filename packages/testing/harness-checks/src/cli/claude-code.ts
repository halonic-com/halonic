import { type ExecFileException, execFile } from "node:child_process";
import { mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { arch, homedir, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type AskOutside, checkClaudeCode, oauthTokenVariable } from "../claude-code-check.ts";
import { claudeCodeReport } from "../report.ts";
import { systemKeychain } from "../sign-in-storage.ts";

/**
 * pnpm --filter @halonicjs/testing-harness-checks check:claude-code --settings-folder <folder> [--expire-sign-in] [--use-oauth-token] [--timeout-seconds <n>]
 *
 * HAL-1710 checks 1 and 2 for Claude Code, run by hand on a person's
 * computer. Prints a Markdown report that is safe to paste into a task: it
 * holds header names, paths, hosts and present or absent, never a value.
 * See the package README for the steps before it.
 */

const usage = [
  "Usage: check:claude-code --settings-folder <folder> [--expire-sign-in] [--use-oauth-token] [--timeout-seconds <n>]",
  "",
  "  --settings-folder   the agent's settings folder (CLAUDE_CONFIG_DIR) you signed in to with",
  "                      `CLAUDE_CONFIG_DIR=<folder> claude auth login`",
  "  --expire-sign-in    also run on a copy of the folder whose sign-in has expired, to see where a refresh goes",
  `  --use-oauth-token   pass ${oauthTokenVariable} from your environment (from \`claude setup-token\`) into the sandbox`,
  "  --timeout-seconds   how long one prompt may take (default 180)",
].join("\n");

interface Options {
  settingsFolder: string;
  expireSignIn: boolean;
  useOauthToken: boolean;
  timeoutMs: number;
}

function readOptions(args: string[]): Options {
  const { values } = parseArgs({
    args,
    options: {
      "settings-folder": { type: "string" },
      "expire-sign-in": { type: "boolean", default: false },
      "use-oauth-token": { type: "boolean", default: false },
      "timeout-seconds": { type: "string", default: "180" },
    },
  });
  const seconds = Number(values["timeout-seconds"]);
  if (values["settings-folder"] === undefined || !Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error(usage);
  }
  return {
    settingsFolder: resolve(values["settings-folder"]),
    expireSignIn: values["expire-sign-in"],
    useOauthToken: values["use-oauth-token"],
    timeoutMs: seconds * 1_000,
  };
}

/** Runs a program as the person, outside the sandbox, with only the variables given. */
const askOutside: AskOutside = (program, args, env) =>
  new Promise((done) => {
    execFile(program, args, { env, timeout: 60_000 }, (error, stdout) => {
      done({ code: exitCode(error), stdout });
    });
  });

/** The exit code `execFile` reports: 0 without an error, `null` when a signal or a failed start ended it. */
function exitCode(error: ExecFileException | null): number | null {
  if (error === null) return 0;
  return typeof error.code === "number" ? error.code : null;
}

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));
  if (!(await stat(options.settingsFolder)).isDirectory()) {
    throw new Error(`${options.settingsFolder} is not a folder.`);
  }
  const oauthToken = options.useOauthToken ? process.env[oauthTokenVariable] : undefined;
  if (options.useOauthToken && oauthToken === undefined) {
    throw new Error(`--use-oauth-token needs ${oauthTokenVariable} in your environment.`);
  }
  const scratchFolder = await realpath(await mkdtemp(join(tmpdir(), "halonic-harness-check-")));
  try {
    process.stderr.write("Checking Claude Code inside srt, with only the bridge reachable…\n");
    const findings = await checkClaudeCode({
      settingsFolder: await realpath(options.settingsFolder),
      scratchFolder,
      expireSignIn: options.expireSignIn,
      oauthToken,
      hostEnv: { PATH: process.env["PATH"] ?? "", HOME: homedir() },
      keychain: systemKeychain,
      askOutside,
      promptTimeoutMs: options.timeoutMs,
    });
    process.stdout.write(claudeCodeReport(findings, { platform: platform(), arch: arch() }));
  } finally {
    // The scratch folder holds the expired copy of the sign-in, so it never stays behind.
    await rm(scratchFolder, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
