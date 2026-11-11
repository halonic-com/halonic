import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { errorLine } from "./fence-proof.ts";
import { makeLauncherTemp } from "./launcher-temp.ts";
import { buildSrtConfig } from "./srt-config.ts";
import type { Runner } from "./srt-runner.ts";
import { launcherEnv, programEnv } from "./srt-session-env.ts";

/** How long srt gets to start its smallest sandbox and run `true` in it. */
export const readyCheckTimeoutMs = 10_000;

/**
 * Starts srt's smallest real sandbox once and runs `true` in it, the way a
 * session starts its programs: the same settings, launcher and runner, and a
 * bridge, so srt sets up its network namespace and `socat` bridge too.
 * Bubblewrap starting with a user namespace doesn't prove that much.
 *
 * @returns null when `true` ran, otherwise one line on what went wrong, srt's own when it said why. Never throws.
 */
export async function startSmallestSandbox(
  runner: Runner,
  timeoutMs: number = readyCheckTimeoutMs,
): Promise<string | null> {
  let folder: string | null = null;
  let launcherTemp: string | null = null;
  try {
    folder = await mkdtemp(join(tmpdir(), "halonic-srt-ready-"));
    launcherTemp = await makeLauncherTemp();
    const profile: SandboxProfile = {
      workingFolder: join(folder, "work"),
      tempFolder: join(folder, "temp"),
      settingsFolder: null,
      readOnlyPaths: [],
      deniedPaths: [],
      env: {},
      // Nothing listens there: srt only needs a bridge to set one up.
      network: { bridge: { host: "127.0.0.1", port: 9 }, allowedSites: [] },
      timeLimitMs: timeoutMs,
    };
    await mkdir(profile.workingFolder);
    await mkdir(profile.tempFolder);
    const settingsPath = join(folder, "settings.json");
    await writeFile(settingsPath, JSON.stringify(buildSrtConfig(profile)), { mode: 0o600 });
    return await runTrue(runner, timeoutMs, {
      settingsPath,
      program: "true",
      args: [],
      cwd: profile.workingFolder,
      launcherEnv: launcherEnv(profile, process.env, undefined, launcherTemp),
      programEnv: programEnv(profile),
      withoutSrtEnv: false,
    });
  } catch (error) {
    return errorLine(error instanceof Error ? error.message : String(error)) || "srt didn't start";
  } finally {
    if (folder !== null) await rm(folder, { recursive: true, force: true });
    if (launcherTemp !== null) await rm(launcherTemp, { recursive: true, force: true });
  }
}

/** Runs the request and waits at most `timeoutMs` for it to end, launch included. */
async function runTrue(
  runner: Runner,
  timeoutMs: number,
  request: Parameters<Runner["run"]>[0],
): Promise<string | null> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const started = runner.run(request);
  try {
    const program = await Promise.race([started, timedOut]);
    if (program === "timeout") {
      void started.then((late) => late.killTree()).catch(() => {});
      return `srt didn't start a sandbox within ${timeoutMs / 1000} seconds`;
    }
    void program.stdin.close().catch(() => {});
    void program.stdout.cancel().catch(() => {});
    const errors = new Response(program.stderr).text().catch(() => "");
    const exit = await Promise.race([program.ended, timedOut]);
    if (exit === "timeout") {
      program.killTree();
      return `srt didn't start a sandbox within ${timeoutMs / 1000} seconds`;
    }
    if (exit.code === 0) return null;
    return errorLine(await errors) || `srt ended with ${exit.code ?? exit.signal}`;
  } finally {
    clearTimeout(timer);
  }
}
