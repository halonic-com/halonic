import { mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { arch, homedir, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { askOutside } from "../ask-outside.ts";
import { checkCodex } from "../codex-check.ts";
import { codexReport } from "../report.ts";
import { systemKeychain } from "../sign-in-storage.ts";

/**
 * pnpm --filter @halonicjs/testing-harness-checks check:codex --settings-folder <folder> [--expire-sign-in] [--timeout-seconds <n>]
 *
 * HAL-1710 check 1 for Codex, run by hand on a person's computer. Prints a
 * Markdown report that is safe to paste into a task: it holds header
 * names, paths, hosts and present or absent, never a value. See the
 * package README for the steps before it.
 */

const usage = [
  "Usage: check:codex --settings-folder <folder> [--expire-sign-in] [--timeout-seconds <n>]",
  "",
  "  --settings-folder   the agent's settings folder (CODEX_HOME) you signed in to with",
  "                      `CODEX_HOME=<folder> codex login`",
  "  --expire-sign-in    also run on a copy of the folder whose sign-in is due a refresh, to see where the refresh goes",
  "  --timeout-seconds   how long one prompt may take (default 180)",
].join("\n");

interface Options {
  settingsFolder: string;
  expireSignIn: boolean;
  timeoutMs: number;
}

function readOptions(args: string[]): Options {
  const { values } = parseArgs({
    args,
    options: {
      "settings-folder": { type: "string" },
      "expire-sign-in": { type: "boolean", default: false },
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
    timeoutMs: seconds * 1_000,
  };
}

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));
  if (!(await stat(options.settingsFolder)).isDirectory()) {
    throw new Error(`${options.settingsFolder} is not a folder.`);
  }
  const scratchFolder = await realpath(await mkdtemp(join(tmpdir(), "halonic-harness-check-")));
  try {
    process.stderr.write("Checking Codex inside srt, with only the bridge reachable…\n");
    const findings = await checkCodex({
      settingsFolder: await realpath(options.settingsFolder),
      scratchFolder,
      expireSignIn: options.expireSignIn,
      hostEnv: { PATH: process.env["PATH"] ?? "", HOME: homedir() },
      keychain: systemKeychain,
      askOutside,
      promptTimeoutMs: options.timeoutMs,
    });
    process.stdout.write(codexReport(findings, { platform: platform(), arch: arch() }));
  } finally {
    // The scratch folder holds the aged copy of the sign-in, so it never stays behind.
    await rm(scratchFolder, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
