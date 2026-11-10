import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { executableName } from "../src/build/build-sea.ts";

/**
 * Runs the built executable and checks what it prints, then reports its size.
 * `pnpm smoke:sea` runs after `pnpm build:sea`, on every system CI checks:
 *
 * 1. the host unpacks its payload into a fresh profile folder and prints its version;
 * 2. it loads sandbox-srt from the payload and says whether the sandbox works here;
 * 3. srt's command line runs through the executable, as sandbox-srt starts it.
 *
 * The last line is the size, which CI puts in the job summary.
 */
const packageDirectory = join(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8")) as {
  version: string;
};
const executable = join(packageDirectory, "dist", executableName(process.platform));
const profile = mkdtempSync(join(tmpdir(), "agent-host-smoke-"));

/** Runs the executable; a check that fails names what it expected and what it got. */
function check(args: string[], expected: RegExp, what: string): void {
  const printed = execFileSync(executable, args, { encoding: "utf8" });
  if (!expected.test(printed)) {
    throw new Error(`${what}: expected ${expected}, got ${JSON.stringify(printed)}.`);
  }
  console.log(`OK: ${what}.`);
}

try {
  const versionLine = `halonic-agent-host ${version.replaceAll(".", "\\.")}\n`;
  check(["--profile-folder", profile], new RegExp(`^${versionLine}$`), "prints its version");
  check(
    ["--profile-folder", profile, "--sandbox-check"],
    new RegExp(`^${versionLine}\\{"ok":(true|false),.*\\}\n$`),
    "checks the sandbox",
  );
  const [unpacked] = readdirSync(join(profile, "agent-host"));
  const srtCli = join(profile, "agent-host", unpacked ?? "", "node_modules", "@anthropic-ai");
  check(
    [join(srtCli, "sandbox-runtime", "dist", "cli.js"), "--version"],
    /^\d+\.\d+\.\d+\n$/,
    "runs srt's command line",
  );
  const megabytes = (statSync(executable).size / 1024 / 1024).toFixed(1);
  const compressed = (gzipSync(readFileSync(executable)).length / 1024 / 1024).toFixed(1);
  console.log(`OK: size ${megabytes} MB (${compressed} MB gzipped).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  rmSync(profile, { recursive: true, force: true });
}
