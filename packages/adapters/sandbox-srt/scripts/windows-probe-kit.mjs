// Shared harness of the Windows verdict probes (HAL-3776): a temporary root
// with a work folder and a denied secret, a loopback canary port the fence must
// block, srt settings, runs inside and outside srt, and the result table.
//
// Same rules as windows-spike-probe.mjs: a probe that depends on the machine
// also runs outside srt as a control, and a failed control makes the probe
// INCONCLUSIVE. NOT-TESTABLE means the runner lacks what the probe needs.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srtCli = join(packageDir, "node_modules/@anthropic-ai/sandbox-runtime/dist/cli.js");

/** Starts the canary and returns the harness one probe script uses. */
export async function createKit(prefix) {
  const node = process.execPath;
  const root = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), `halonic-${prefix}-`));
  const dir = (name) => {
    const path = join(root, name);
    mkdirSync(path);
    return path;
  };
  const work = dir("work");
  const hidden = dir("hidden");
  const secret = join(hidden, "secret.txt");
  writeFileSync(secret, "hunter2");

  // A loopback port the fence must block (srt only allows 60080-60089).
  const canary = { connections: 0 };
  const server = createServer((socket) => {
    canary.connections += 1;
    socket.on("data", () => {
      socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
    });
    socket.on("error", () => {});
    setTimeout(() => socket.destroy(), 3000).unref();
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;

  let settingsCount = 0;
  const settingsFor = ({ read = [work], write = [work], deny = [hidden] } = {}) => {
    const path = join(root, `settings-${settingsCount++}.json`);
    const allowedDomains = ["example.com", "github.com", "api.nuget.org"];
    const filesystem = { denyRead: deny, allowRead: read, allowWrite: write, denyWrite: [] };
    writeFileSync(
      path,
      JSON.stringify({ network: { allowedDomains, deniedDomains: [] }, filesystem }),
    );
    return path;
  };
  const defaultSettings = settingsFor();

  // The canary server lives in this process, so every probe runs asynchronously:
  // a spawnSync would hold the connections back and the counter would read 0.
  const run = (file, args, options = {}) =>
    new Promise((done) => {
      const child = spawn(file, args, { cwd: work, ...options });
      let out = "";
      let err = "";
      const timer = setTimeout(() => child.kill(), 120_000);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", (e) => (err += String(e)));
      child.on("close", (code) => {
        clearTimeout(timer);
        done({ code, out, err });
      });
    });
  const inSrt = (command, settings = defaultSettings, cwd = work) =>
    run(node, [srtCli, "-s", settings, "-c", command], { cwd });
  const outsideSrt = (command, cwd = work) => run(command, [], { shell: true, cwd });
  // Only for commands that never touch the canary: machine facts and ACL dumps.
  const outsideSync = (file, args, encoding = "utf8") =>
    spawnSync(file, args, { encoding, shell: file === "where" || file === "dotnet" }).stdout ?? "";
  const script = (name, body) => {
    const path = join(work, name);
    writeFileSync(path, body);
    return path;
  };

  const results = [];
  const tail = (s) => s.trim().split(/\r?\n/).slice(-3).join(" | ").slice(0, 300);
  /** status: PASS (fence held / tool worked), FAIL (leaked / broke), INCONCLUSIVE, NOT-TESTABLE, INFO. */
  const record = (group, name, status, detail) => {
    results.push({ group, name, status, detail });
    console.log(`[${status}] ${group}: ${name} - ${detail}`);
  };
  const lastJson = (text) => {
    try {
      return JSON.parse(text.trim().split(/\r?\n/).pop());
    } catch {
      return undefined;
    }
  };

  // srt itself failed to start the program (no sandbox account logon, fence not
  // verified): a blocked answer then proves nothing about the fence.
  const srtFailed = (r) => /srt-win: error|could not be verified/.test(r.out + r.err);

  // Runs a command inside srt and outside, and counts the canary connections.
  const canaryProbe = async (group, name, command, why) => {
    const before = canary.connections;
    const inside = await inSrt(command);
    const reached = canary.connections - before;
    if (reached === 0 && srtFailed(inside)) {
      record(group, name, "INCONCLUSIVE", `srt did not start: ${tail(inside.err || inside.out)}`);
      return;
    }
    const controlBefore = canary.connections;
    const control = await outsideSrt(command);
    if (canary.connections - controlBefore === 0) {
      const detail = `control outside srt never reached the canary (${tail(control.err || control.out)}); inside: ${reached}`;
      record(group, name, "INCONCLUSIVE", detail);
      return;
    }
    const detail = `${reached} connection(s) reached the canary through srt. ${why} ${tail(inside.err || inside.out)}`;
    record(group, name, reached === 0 ? "PASS" : "FAIL", detail);
  };

  const finish = (title, file) => {
    server.close();
    writeFileSync(join(packageDir, file), JSON.stringify(results, null, 2));
    const clean = (s) => s.replace(/\|/g, "/").replace(/\r?\n/g, " ");
    const lines = results.map(
      (r) => `| ${r.group} | ${r.status} | ${r.name} | ${clean(r.detail)} |`,
    );
    const table = `### ${title}\n\n| Group | Result | Probe | Detail |\n| --- | --- | --- | --- |\n${lines.join("\n")}\n`;
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);
    console.log(table);
  };

  return {
    node,
    packageDir,
    root,
    dir,
    work,
    hidden,
    secret,
    port,
    canary,
    settingsFor,
    inSrt,
    outsideSrt,
    outsideSync,
    script,
    record,
    tail,
    lastJson,
    canaryProbe,
    srtFailed,
    finish,
  };
}
