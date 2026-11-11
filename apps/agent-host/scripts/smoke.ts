import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { gzipSync } from "node:zlib";
import { executableName } from "../src/build/build-sea.ts";
import type { Handshake } from "../src/host.ts";

/**
 * Runs the built executable and checks what it prints, then reports its size.
 * `pnpm smoke:sea` runs after `pnpm build:sea`, on every system CI checks:
 *
 * 1. the host unpacks its payload into a fresh profile folder and prints its version;
 * 2. it loads sandbox-srt from the payload and says whether the sandbox works here;
 * 3. srt's command line runs through the executable, as sandbox-srt starts it;
 * 4. it serves on loopback: a request without the token gets 401, one with it
 *    gets the version, the sandbox answers its check over loopback (whether or
 *    not it works on this system), and the host stops when its input closes.
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

/** Starts the host as Studio will, and checks its handshake, its token and its stop. */
async function checkServes(): Promise<void> {
  const host = spawn(executable, ["--profile-folder", profile], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const exited = once(host, "exit") as Promise<[number | null]>;
  try {
    const [line] = (await once(createInterface({ input: host.stdout }), "line")) as [string];
    const handshake = JSON.parse(line) as Handshake;
    const withoutToken = await fetch(`${handshake.url}/v1/health`);
    if (withoutToken.status !== 401) {
      throw new Error(`Without the token: expected 401, got ${withoutToken.status}.`);
    }
    const get = (path: string) =>
      fetch(`${handshake.url}${path}`, {
        headers: { authorization: `Bearer ${handshake.token}` },
      });
    const health = (await (await get("/v1/health")).json()) as { version?: string };
    if (health.version !== version) throw new Error(`Health: got ${JSON.stringify(health)}.`);
    // The sandbox is loaded from the payload and asked through its route.
    const sandbox = await get("/v1/sandbox/check");
    const sandboxCheck = (await sandbox.json()) as { ok?: unknown };
    if (sandbox.status !== 200 || typeof sandboxCheck.ok !== "boolean") {
      throw new Error(`Sandbox check: got ${sandbox.status} ${JSON.stringify(sandboxCheck)}.`);
    }
    host.stdin.end();
    const [code] = await exited;
    if (code !== 0) throw new Error(`The host exited with ${code} when its input closed.`);
  } finally {
    host.kill();
  }
  console.log(
    "OK: serves on loopback with its token, answers the sandbox check, and stops when its input closes.",
  );
}

try {
  const versionLine = `halonic-agent-host ${version.replaceAll(".", "\\.")}\n`;
  check(
    ["--profile-folder", profile, "--version"],
    new RegExp(`^${versionLine}$`),
    "prints its version",
  );
  check(
    ["--profile-folder", profile, "--sandbox-check"],
    /^\{"ok":(true|false),.*\}\n$/,
    "checks the sandbox",
  );
  const [unpacked] = readdirSync(join(profile, "agent-host"));
  const srtCli = join(profile, "agent-host", unpacked ?? "", "node_modules", "@anthropic-ai");
  check(
    [join(srtCli, "sandbox-runtime", "dist", "cli.js"), "--version"],
    /^\d+\.\d+\.\d+\n$/,
    "runs srt's command line",
  );
  await checkServes();
  const megabytes = (statSync(executable).size / 1024 / 1024).toFixed(1);
  const compressed = (gzipSync(readFileSync(executable)).length / 1024 / 1024).toFixed(1);
  console.log(`OK: size ${megabytes} MB (${compressed} MB gzipped).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  rmSync(profile, { recursive: true, force: true });
}
