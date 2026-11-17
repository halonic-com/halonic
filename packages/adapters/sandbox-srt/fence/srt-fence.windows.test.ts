import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { srtNetworkVariables } from "../src/srt-runner.ts";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * The fence on a real Windows machine, through `SandboxSession` (HAL-4347):
 * the session itself must report `fenced`, and a program it starts must see
 * the hidden file, the blocked port and its own variables as the profile says.
 * Run by the `sandbox-windows` CI job after srt's Windows install
 * (`vitest.fence-windows.config.ts`). There is no `sh`, `cat` or `env` there,
 * so the programs are Node scripts in the working folder.
 *
 * It works outside the user profile (RUNNER_TEMP in CI), because the sandbox
 * account cannot look inside the profile of the user who ran the install.
 */
const sandbox = new SrtSandbox();

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

describe("SrtSandbox on Windows, through the session", () => {
  let base: string;
  let work: string;
  let session: SandboxSession;
  let canary: Server;
  let canaryPort: number;
  let connections = 0;

  const profile = (): SandboxProfile => ({
    workingFolder: work,
    tempFolder: join(base, "temp"),
    settingsFolder: null,
    readOnlyPaths: [join(base, "workspace")],
    deniedPaths: [join(base, "secrets")],
    env: { HALONIC_FENCE_VAR: "a value with spaces" },
    network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 120_000,
  });

  /** Runs a Node script from the working folder inside the fence and returns what it printed. */
  async function runScript(name: string, source: string, inside = session): Promise<string> {
    await writeFile(join(work, name), source);
    const started = await inside.start({ program: process.execPath, args: [join(work, name)] });
    const [out, errors] = await Promise.all([
      read(started.stdout),
      read(started.stderr),
      started.exited,
    ]);
    if (out.trim() === "") throw new Error(`${name} printed nothing; its errors: ${errors}`);
    return out.trim();
  }

  beforeAll(async () => {
    base = await mkdtemp(join(process.env["RUNNER_TEMP"] ?? tmpdir(), "srt-win-"));
    work = join(base, "work");
    await mkdir(work, { recursive: true });
    await mkdir(join(base, "secrets"), { recursive: true });
    await writeFile(join(base, "secrets", "key.txt"), "hunter2");
    await mkdir(join(base, "workspace"), { recursive: true });
    await writeFile(join(base, "workspace", "tool.txt"), "the tool");
    canary = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) => canary.listen(0, "127.0.0.1", resolve));
    canaryPort = (canary.address() as { port: number }).port;
    session = await sandbox.open(profile());
  });

  afterAll(async () => {
    await session?.close();
    canary?.close();
    await rm(base, { recursive: true, force: true });
  });

  it("can start on this machine", async () => {
    expect(await sandbox.check()).toEqual({ ok: true, reason: null, missing: [] });
  });

  it("proves the fence", () => {
    expect(session.fence).toEqual({ state: "fenced" });
  });

  it("hides the denied file, blocks the port, and sets the profile's variable", async () => {
    const out = await runScript(
      "probe.cjs",
      `const fs = require("node:fs");
const net = require("node:net");
const result = { variable: process.env.HALONIC_FENCE_VAR };
try { fs.writeFileSync(${JSON.stringify(join(work, "made.txt"))}, "x"); result.write = "written"; } catch { result.write = "refused"; }
try { fs.writeFileSync(${JSON.stringify(join(base, "outside.txt"))}, "x"); result.outside = "written"; } catch { result.outside = "refused"; }
try { fs.readFileSync(${JSON.stringify(join(base, "secrets", "key.txt"))}); result.secret = "read"; } catch { result.secret = "hidden"; }
const done = (port) => { result.port = port; console.log(JSON.stringify(result)); process.exit(0); };
const socket = net.connect({ host: "127.0.0.1", port: ${canaryPort} });
socket.on("connect", () => done("connected"));
socket.on("error", () => done("blocked"));
setTimeout(() => done("blocked"), 5000);
`,
    );
    expect(JSON.parse(out.split(/\r?\n/).pop() ?? "")).toEqual({
      variable: "a value with spaces",
      write: "written",
      outside: "refused",
      secret: "hidden",
      port: "blocked",
    });
    expect(connections).toBe(0);
    expect(await readFile(join(work, "made.txt"), "utf8")).toBe("x");
  });

  it("starts in a read-only folder, reads there and can't write there (HAL-6884)", async () => {
    // A connector's script in the workspace, read by relative paths from where it starts.
    const workspace = join(base, "workspace");
    await writeFile(
      join(workspace, "tool.cjs"),
      `const fs = require("node:fs");
const result = { read: fs.readFileSync("tool.txt", "utf8") };
try { fs.writeFileSync("made.txt", "x"); result.write = "written"; } catch { result.write = "refused"; }
console.log(JSON.stringify(result));
`,
    );
    const started = await session.start({
      program: process.execPath,
      args: ["tool.cjs"],
      cwd: workspace,
    });
    const [out, errors, exit] = await Promise.all([
      read(started.stdout),
      read(started.stderr),
      started.exited,
    ]);
    expect(exit.code, errors).toBe(0);
    expect(JSON.parse(out.trim().split(/\r?\n/).pop() ?? "")).toEqual({
      read: "the tool",
      write: "refused",
    });
    await expect(readFile(join(workspace, "made.txt"), "utf8")).rejects.toThrow();
  });

  /**
   * Runs a script that tries to put content into each file (as path segments below the working
   * folder), either by writing it or by writing it elsewhere and moving it into place, and reports
   * for each how much content is on disk afterwards. Windows lets a program create a file in a
   * denied folder but refuses to write to it, so an empty file may be left behind: that is no
   * content. A file that is not there counts as empty too. Also reports whether each file was
   * there before the attempt.
   */
  async function contentLeftBy(
    how: "writing" | "moving",
    name: string,
    attempts: Record<string, string[]>,
  ): Promise<Record<string, { existedBefore: boolean; size: number }>> {
    const out = await runScript(
      name,
      `const fs = require("node:fs");
const path = require("node:path");
const work = ${JSON.stringify(work)};
const how = ${JSON.stringify(how)};
const attempts = ${JSON.stringify(attempts)};
const result = {};
for (const [label, segments] of Object.entries(attempts)) {
  const target = path.join(work, ...segments);
  const existedBefore = fs.existsSync(target);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (how === "writing") {
      fs.writeFileSync(target, "x");
    } else {
      const staged = path.join(work, "staged-" + label);
      fs.writeFileSync(staged, "x");
      fs.renameSync(staged, target);
    }
  } catch {
    // Refused: what is left on disk says how far it got.
  }
  result[label] = { existedBefore, size: fs.existsSync(target) ? fs.statSync(target).size : 0 };
}
console.log(JSON.stringify(result));
`,
    );
    return JSON.parse(out.split(/\r?\n/).pop() ?? "");
  }

  function sizes(left: Record<string, { size: number }>): Record<string, number> {
    return Object.fromEntries(Object.entries(left).map(([label, file]) => [label, file.size]));
  }

  it("makes the root tool-settings files empty when it opens and denies them (HAL-11246)", async () => {
    // Looked at from the host, before any program has tried anything.
    const sizesAtOpen: Record<string, number> = {};
    for (const file of [".npmrc", ".mcp.json", ".pre-commit-config.yaml"]) {
      sizesAtOpen[file] = (await stat(join(work, file))).size;
    }
    expect(sizesAtOpen).toEqual({ ".npmrc": 0, ".mcp.json": 0, ".pre-commit-config.yaml": 0 });
  });

  it("leaves the empty root files in the working folder after the session closes (HAL-11246)", async () => {
    const closing = join(base, "closing");
    await mkdir(closing, { recursive: true });
    const closed = await sandbox.open({ ...profile(), workingFolder: closing });
    await closed.close();
    const left: Record<string, boolean> = {};
    for (const file of [".npmrc", ".mcp.json", ".pre-commit-config.yaml"]) {
      left[file] = await stat(join(closing, file)).then(
        () => true,
        () => false,
      );
    }
    // Records what srt does today (threat model 4.6). If srt starts removing them, this fails
    // and the docs change with it.
    expect(left).toEqual({ ".npmrc": true, ".mcp.json": true, ".pre-commit-config.yaml": true });
  });

  for (const how of ["writing", "moving"] as const) {
    it(`can't put content into the tool folders that were made at the start, by ${how} it (HAL-11246)`, async () => {
      // Windows denies through the file system's permissions, which need an existing folder.
      // The folder deny covers what is made inside it later.
      const left = await contentLeftBy(how, `folders-${how}.cjs`, {
        claudeSettings: [".claude", "settings.json"],
        vscodeTasks: [".vscode", "tasks.json"],
      });
      expect(sizes(left)).toEqual({ claudeSettings: 0, vscodeTasks: 0 });
    });

    it(`can't put content into the tool settings in the root of the working folder, by ${how} it`, async () => {
      const left = await contentLeftBy(how, `root-${how}.cjs`, {
        npmrc: [".npmrc"],
        mcp: [".mcp.json"],
        hookManager: [".pre-commit-config.yaml"],
      });
      expect(sizes(left)).toEqual({ npmrc: 0, mcp: 0, hookManager: 0 });
      // srt made each of them empty when the session opened and denies it, so the program's
      // attempt finds the file already there.
      expect(Object.values(left).map((file) => file.existedBefore)).toEqual([true, true, true]);
    });
  }

  it("can't create a git hook or change the git config of a repository that was there at the start", async () => {
    const repository = join(base, "repository");
    await mkdir(join(repository, ".git", "hooks"), { recursive: true });
    await writeFile(join(repository, ".git", "config"), "[core]\n");
    const withRepository = await sandbox.open({ ...profile(), workingFolder: repository });
    try {
      const out = await runScript(
        "hook.cjs",
        `const fs = require("node:fs");
const result = {};
try { fs.writeFileSync(${JSON.stringify(join(repository, ".git", "hooks", "pre-commit"))}, "x"); result.hook = "written"; } catch { result.hook = "refused"; }
try { fs.appendFileSync(${JSON.stringify(join(repository, ".git", "config"))}, "x"); result.config = "written"; } catch { result.config = "refused"; }
console.log(JSON.stringify(result));
`,
        withRepository,
      );
      expect(JSON.parse(out.split(/\r?\n/).pop() ?? "")).toEqual({
        hook: "refused",
        config: "refused",
      });
    } finally {
      await withRepository.close();
    }
  });

  // Known gap (HAL-11305), not tested: a repository made during the session has no deny, so a
  // program in the fence can still write a hook into a new `.git/hooks`.

  it("without a bridge, reaches no loopback port and gets none of srt's network variables", async () => {
    const before = connections;
    const unbridged = await sandbox.open({
      ...profile(),
      network: { bridge: null, allowedSites: [] },
    });
    try {
      expect(unbridged.fence).toEqual({ state: "fenced" });
      const out = await runScript(
        "no-bridge.cjs",
        `const net = require("node:net");
const network = new Set(${JSON.stringify(srtNetworkVariables.map((name) => name.toUpperCase()))});
const result = { networkVariables: Object.keys(process.env).filter((name) => /proxy/i.test(name) || network.has(name.toUpperCase())) };
const report = () => { console.log(JSON.stringify(result)); process.exit(0); };
const finish = () => { if ("direct" in result && "proxy" in result) report(); };
process.on("uncaughtException", (error) => { result.error = String(error); report(); });
const socket = net.connect({ host: "127.0.0.1", port: ${canaryPort} });
socket.on("connect", () => { result.direct = "connected"; finish(); });
socket.on("error", () => { result.direct = "blocked"; finish(); });
const proxy = process.env.HTTP_PROXY ?? process.env.http_proxy;
if (proxy === undefined) { result.proxy = "none"; finish(); }
else {
  // srt may name its proxy without a scheme.
  const via = new URL(proxy.includes("://") ? proxy : "http://" + proxy);
  // A raw request, because newer Node's http.request refuses an absolute-URL
  // path for another host than the one it connects to.
  const target = "127.0.0.1:${canaryPort}";
  const proxied = net.connect({ host: via.hostname, port: Number(via.port) || 80 });
  const answer = (outcome) => { if (!("proxy" in result)) { result.proxy = outcome; finish(); } };
  proxied.on("connect", () => proxied.write("GET http://" + target + "/ HTTP/1.1\\r\\nHost: " + target + "\\r\\nConnection: close\\r\\n\\r\\n"));
  proxied.once("data", (data) => answer(/^HTTP\\/1\\.[01] 200 /.test(data.toString("latin1")) ? "reached" : "refused"));
  proxied.on("error", () => answer("refused"));
  proxied.on("close", () => answer("refused"));
}
setTimeout(() => { result.direct ??= "blocked"; result.proxy ??= "refused"; report(); }, 5000);
`,
        unbridged,
      );
      const result = JSON.parse(out.split(/\r?\n/).pop() ?? "");
      expect(result.error).toBeUndefined();
      expect(result.networkVariables).toEqual([]);
      expect(result.direct).toBe("blocked");
      expect(result.proxy).not.toBe("reached");
      expect(connections).toBe(before);
    } finally {
      await unbridged.close();
    }
  });

  it("gives the exit code of the program", async () => {
    await writeFile(join(work, "exit.cjs"), "process.exit(3);");
    const started = await session.start({
      program: process.execPath,
      args: [join(work, "exit.cjs")],
    });
    expect(await started.exited).toMatchObject({ code: 3, reason: "exited" });
  });

  it("kill ends a program and the process it started", async () => {
    const ticks = join(base, "temp", "ticks");
    const loop = `const fs = require("node:fs");
setInterval(() => fs.writeFileSync(${JSON.stringify(ticks)}, String(Date.now())), 100);`;
    await writeFile(join(work, "loop.cjs"), loop);
    await writeFile(
      join(work, "parent.cjs"),
      `const { spawn } = require("node:child_process");
spawn(process.execPath, [${JSON.stringify(join(work, "loop.cjs"))}], { stdio: "ignore" });
setInterval(() => {}, 1000);`,
    );
    const started = await session.start({
      program: process.execPath,
      args: [join(work, "parent.cjs")],
    });
    const deadline = Date.now() + 20_000;
    let before = await readFile(ticks, "utf8").catch(() => "");
    while (before === "" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      before = await readFile(ticks, "utf8").catch(() => "");
    }
    expect(before).not.toBe("");
    await started.kill();
    expect((await started.exited).reason).toBe("stopped");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const after = await readFile(ticks, "utf8");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await readFile(ticks, "utf8")).toBe(after);
  });
});
