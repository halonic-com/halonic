// MXC process-container spike, round 3 (HAL-2545). Throwaway.
// Question: with --preserve-symlinks --preserve-symlinks-main (via NODE_OPTIONS) and NO drive-root grant,
// do real pnpm commands work inside a BaseContainer? Host side creates a tiny workspace and fills a pnpm store
// (online, outside the container); the container then runs pnpm -v, pnpm install --offline, pnpm run build.
// Prints one JSON object on the last stdout line.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const drive = `${process.env.SystemDrive ?? "C:"}\\`;
const base = process.env.SPIKE_ROOT ?? join(drive, "mxc-spike-data");
const ws = join(base, "ws"), store = join(base, "pnpm-store"), home = join(base, "pnpm-home");
rmSync(ws, { recursive: true, force: true });
for (const d of [ws, join(ws, "packages", "app", "src"), store, home]) mkdirSync(d, { recursive: true });
const { run, getPlatformSupport } = await import("@microsoft/mxc-sdk/v1");
const q = (p) => `"${p}"`;
const where = (t) => {
  const r = spawnSync("where.exe", [t], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
};
const nodeExe = process.execPath, nodeDir = dirname(nodeExe);
const pnpmCmd = where("pnpm.cmd");
const pnpmDir = dirname(pnpmCmd);
const sysRoot = process.env.SystemRoot;

// Tiny workspace: one package with a node-script build and a tsc build.
const w = (f, s) => writeFileSync(join(ws, f), s);
w("package.json", JSON.stringify({ name: "root", private: true, scripts: { build: "pnpm -r run build", "build:tsc": "pnpm --filter app run build:tsc" } }, null, 2));
w("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
w("packages/app/package.json", JSON.stringify({ name: "app", version: "1.0.0", private: true, scripts: { build: "node build.mjs", "build:tsc": "tsc -p ." }, devDependencies: { typescript: "5.9.3" } }, null, 2));
w("packages/app/build.mjs", 'import { mkdirSync, writeFileSync } from "node:fs";\nmkdirSync("dist", { recursive: true });\nwriteFileSync("dist/out.txt", "built by node " + process.version);\nconsole.log("build ok");\n');
w("packages/app/tsconfig.json", JSON.stringify({ compilerOptions: { outDir: "dist-tsc", strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" }, include: ["src"] }));
w("packages/app/src/index.ts", 'export const hello = (n: string): string => `hi ${n}`;\n');

const hostEnv = { ...process.env, npm_config_store_dir: store };
const hostRun = (args) => spawnSync("cmd.exe", ["/c", "pnpm", ...args], { cwd: ws, env: hostEnv, encoding: "utf8" });
const fill = hostRun(["install"]);
console.error(`host pnpm install (fills lockfile and store): exit ${fill.status}`);
if (fill.status !== 0) { console.log(JSON.stringify({ hostInstallFailed: (fill.stdout + fill.stderr).slice(-800) })); process.exit(1); }
rmSync(join(ws, "node_modules"), { recursive: true, force: true });
rmSync(join(ws, "packages", "app", "node_modules"), { recursive: true, force: true });

const FLAGS = "--preserve-symlinks --preserve-symlinks-main";
async function inBox(label, command, { read, flags = true, extraEnv = {}, timeoutMs = 180_000 }) {
  const t0 = performance.now();
  const environment = {
    PATH: [nodeDir, pnpmDir, `${sysRoot}\\System32`, sysRoot].join(";"),
    npm_config_store_dir: store, PNPM_HOME: home, XDG_CACHE_HOME: join(home, "cache"), XDG_DATA_HOME: join(home, "data"), XDG_STATE_HOME: join(home, "state"),
    npm_config_update_notifier: "false", COREPACK_ENABLE_AUTO_PIN: "0",
    ...(flags ? { NODE_OPTIONS: FLAGS } : {}), ...extraEnv,
  };
  let rec;
  try {
    const out = await run({
      command,
      filesystem: { readonlyPaths: read, readwritePaths: [ws, store, home], deniedPaths: [] },
      workingDirectory: ws,
      network: { egress: { default: "deny" }, ingress: { default: "deny", hostLoopback: "deny" } },
      timeoutMs,
      ui: { disable: false, clipboard: "none", allowInputInjection: false },
      environment, inheritDefaultEnvironment: true,
    });
    rec = { exit: out.exitCode, hex: out.exitCode == null ? null : `0x${(out.exitCode >>> 0).toString(16).toUpperCase()}`, stdout: String(out.stdout ?? "").trim().slice(-500), stderr: String(out.stderr ?? "").trim().slice(0, 900), timedOut: out.timedOut };
  } catch (error) {
    rec = { error: String(error?.message ?? error).split("\n")[0] };
  }
  rec.ms = Math.round(performance.now() - t0);
  rec.ok = rec.exit === 0 && !rec.error;
  console.error(`${label}: ok=${rec.ok} exit ${rec.exit} ${rec.error ?? ""} (${rec.ms} ms)`);
  return rec;
}

const read = [nodeDir, pnpmDir, sysRoot].filter(Boolean);
const results = {};
const cmd = (c) => `cmd.exe /d /c ${c}`;
// Order matters: the first failure is the answer to "what breaks first".
results["1 node --version (flags in NODE_OPTIONS)"] = await inBox("1", cmd("node --version"), { read });
results["2 pnpm -v"] = await inBox("2", cmd("pnpm -v"), { read });
results["3 pnpm install --offline --frozen-lockfile"] = await inBox("3", cmd("pnpm install --offline --frozen-lockfile"), { read });
results["4 pnpm run build (node script)"] = await inBox("4", cmd("pnpm run build"), { read });
results["5 pnpm run build:tsc (tsc)"] = await inBox("5", cmd("pnpm run build:tsc"), { read });
// Controls: the same pnpm -v and build without the flags, and with the drive root readable.
results["C1 pnpm -v, NO flags, no drive root"] = await inBox("C1", cmd("pnpm -v"), { read, flags: false });
results["C2 pnpm run build, NO flags, no drive root"] = await inBox("C2", cmd("pnpm run build"), { read, flags: false });
results["C3 pnpm run build, NO flags, drive root readable"] = await inBox("C3", cmd("pnpm run build"), { read: [...read, drive], flags: false });
// Did the build outputs actually land on the host side?
const outs = {
  nodeBuild: existsSync(join(ws, "packages", "app", "dist", "out.txt")) ? readFileSync(join(ws, "packages", "app", "dist", "out.txt"), "utf8") : null,
  tscBuild: existsSync(join(ws, "packages", "app", "dist-tsc", "index.js")),
  nodeModulesInstalled: existsSync(join(ws, "packages", "app", "node_modules")),
};
const firstFailure = Object.entries(results).filter(([k]) => /^[1-5] /.test(k)).find(([, v]) => !v.ok)?.[0] ?? null;
console.log(JSON.stringify({ mode: "pnpm", support: getPlatformSupport(), paths: { nodeExe, pnpmCmd }, firstFailure, outs, results }));
