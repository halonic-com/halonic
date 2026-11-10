// MXC go/no-go checks (HAL-3303). Throwaway, never merges.
// Every container start goes through spawn() / MxcProcess (streams, kill), with telemetry off,
// the UI policy on (round 2), the symlink flags in NODE_OPTIONS and no drive-root read grant.
// Modes (argv[2]):
//   harness  claude --version, codex --version, then one short run of each against a stub on the bridge port
//   network  bridge port reached, a second loopback port and an outside site not; stdin/stdout streams; kill ends children
//   denials  captureDenials during a run: file and network denials
//   pnpm     TEMP/TMP/TMPDIR in the working folder; "enumerate only" on the drive root; the hidden-file canary
// Prints "RESULT ..." lines and one JSON object on the last stdout line.
import { spawnSync } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";

const { spawn: mxcSpawn, getPlatformSupport, getAvailableBackends } = await import("@microsoft/mxc-sdk/v1");

// Make a silent exit visible: something ended the denials run with exit 1 and no output.
process.on("exit", (code) => console.error(`probe exit code ${code}`));
process.on("uncaughtException", (error) => console.error(`uncaught: ${error?.stack ?? error}`));
process.on("unhandledRejection", (error) => console.error(`unhandled rejection: ${error?.stack ?? error}`));

const drive = `${process.env.SystemDrive ?? "C:"}\\`;
const sysRoot = process.env.SystemRoot;
const base = process.env.SPIKE_ROOT ?? join(drive, "mxc-spike-data");
mkdirSync(base, { recursive: true });
const mode = process.argv[2] ?? "network";

const SPAWN_OPTIONS = { telemetry: { enabled: false } };
const UI = { disable: false, clipboard: "none", allowInputInjection: false };
const SYMLINK_FLAGS = "--preserve-symlinks --preserve-symlinks-main";
const q = (p) => `"${p}"`;
const hex = (code) => (code == null ? null : `0x${(code >>> 0).toString(16).toUpperCase()}`);
const firstError = (text) => (text ?? "").split(/\r?\n/).find((l) => /error|EPERM|denied|not permitted|failed/i.test(l))?.trim().slice(0, 300) ?? null;
const where = (tool) => {
  const r = spawnSync("where.exe", [tool], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
};
const findFile = (root, name, depth = 8) => {
  if (depth < 0 || !existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name) return p;
    if (entry.isDirectory()) {
      const hit = findFile(p, name, depth - 1);
      if (hit) return hit;
    }
  }
  return null;
};

// ---- Network policies -------------------------------------------------------------------------

const network = {
  closed: { egress: { default: "deny" }, ingress: { default: "deny", hostLoopback: "deny" } },
  // The policy under test: host loopback denied, one egress allow rule for 127.0.0.1/32 on the bridge port.
  bridgeOnly: (port) => ({
    egress: { default: "deny", allow: [{ to: [{ cidr: "127.0.0.1/32" }], ports: [{ protocol: "tcp", port }] }] },
    ingress: { default: "deny", hostLoopback: "deny" },
  }),
  // Fallback if bridgeOnly cannot reach the bridge: host loopback allowed, the same egress rule.
  bridgeOnlyLoopbackAllowed: (port) => ({
    egress: { default: "deny", allow: [{ to: [{ cidr: "127.0.0.1/32" }], ports: [{ protocol: "tcp", port }] }] },
    ingress: { default: "deny", hostLoopback: "allow" },
  }),
  // Open control: every host-loopback port reachable. Proves "not reached" above is the policy, not the probe.
  loopbackOpen: { egress: { default: "deny" }, ingress: { default: "deny", hostLoopback: "allow" } },
};

// ---- Running one command in the box --------------------------------------------------------------

/** A Windows environment for the box: profile folders inside the working folder, symlink flags on. */
function boxEnvironment(work, extra = {}) {
  const home = join(work, "home");
  for (const d of ["", "AppData\\Roaming", "AppData\\Local"]) mkdirSync(join(home, d), { recursive: true });
  return {
    USERPROFILE: home,
    HOME: home,
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
    NODE_OPTIONS: SYMLINK_FLAGS,
    ...extra,
  };
}

/** TEMP, TMP and TMPDIR pointed into the working folder (round 3 suggestion for pnpm's temp-dir). */
function tempInWork(work) {
  const tmp = join(work, ".tmp");
  mkdirSync(tmp, { recursive: true });
  return { TEMP: tmp, TMP: tmp, TMPDIR: tmp };
}

/**
 * Spawns `command` in a container and collects its streams. Returns exit code, output, timing and
 * the SDK's warnings and output metadata. `onStart(proc, output)` may drive stdin and call kill.
 */
async function inBox(label, command, options) {
  const { work, read = [], write = [], denied = [], net = network.closed, env = {}, containmentConfig, timeoutMs = 120_000, onStart } = options;
  const t0 = performance.now();
  const request = {
    command,
    filesystem: { readonlyPaths: [...new Set(read.filter(Boolean))], readwritePaths: [work, ...write], deniedPaths: denied },
    workingDirectory: work,
    network: net,
    ui: UI,
    timeoutMs,
    environment: boxEnvironment(work, env),
    inheritDefaultEnvironment: true,
    ...(containmentConfig ? { containment: { type: "processcontainer", config: containmentConfig } } : {}),
  };
  const rec = { label };
  let proc;
  try {
    proc = await mxcSpawn(request, SPAWN_OPTIONS);
  } catch (error) {
    rec.spawnError = `${error?.code ?? ""} ${String(error?.message ?? error).split("\n")[0]}`.trim();
    rec.ms = Math.round(performance.now() - t0);
    rec.ok = false;
    console.error(`${label}: spawn failed: ${rec.spawnError}`);
    return rec;
  }
  rec.pid = proc.id;
  const output = { stdout: "", stderr: "", firstStdoutMs: null };
  proc.standardOutput?.setEncoding("utf8");
  proc.standardError?.setEncoding("utf8");
  proc.standardOutput?.on("data", (chunk) => {
    output.firstStdoutMs ??= Math.round(performance.now() - t0);
    output.stdout += chunk;
  });
  proc.standardError?.on("data", (chunk) => {
    output.stderr += chunk;
  });
  try {
    if (onStart) rec.drive = await onStart(proc, output);
    const done = await proc.wait();
    rec.exit = done.exitCode;
    rec.hex = hex(done.exitCode);
    rec.timedOut = done.timedOut;
  } catch (error) {
    rec.waitError = String(error?.message ?? error).split("\n")[0];
  }
  rec.ms = Math.round(performance.now() - t0);
  rec.firstStdoutMs = output.firstStdoutMs;
  rec.stdout = output.stdout.trim().slice(-600);
  rec.stderr = output.stderr.trim().slice(0, 900);
  rec.firstError = firstError(output.stderr) ?? firstError(output.stdout);
  rec.warnings = proc.warnings?.length ? [...proc.warnings] : undefined;
  rec.meta = proc.outputMetadata;
  rec.ok = rec.exit === 0 && !rec.waitError && !rec.timedOut;
  proc.dispose();
  console.error(`${label}: ok=${rec.ok} exit ${rec.exit} ${rec.hex ?? ""} ${rec.waitError ?? rec.firstError ?? ""} (${rec.ms} ms)`);
  return rec;
}

// ---- Host-side listeners ------------------------------------------------------------------------

/** A TCP listener on 127.0.0.1 that counts connections and answers with a tiny HTTP 200. */
async function countingListener() {
  const state = { connections: 0 };
  const server = createTcpServer((socket) => {
    state.connections += 1;
    socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  state.port = server.address().port;
  state.close = () => server.close();
  return state;
}

const STUB_TEXT = "hi from the halonic stub";

/** Stub model endpoint on the bridge port: Anthropic Messages and OpenAI Responses, streaming or not. */
async function stubBridge() {
  const state = { connections: 0, requests: [] };
  const server = createHttpServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body = {};
    try {
      body = JSON.parse(raw || "{}");
    } catch {}
    const path = req.url.split("?")[0];
    state.requests.push({ method: req.method, path, stream: body.stream === true, model: body.model });
    const sse = (events) => {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      res.end();
    };
    const json = (status, data) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    const model = body.model ?? "stub-model";
    if (path.endsWith("/messages/count_tokens")) return json(200, { input_tokens: 12 });
    if (path.endsWith("/messages")) {
      const usage = { input_tokens: 12, output_tokens: 6 };
      const message = { id: "msg_stub", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage };
      if (!body.stream) return json(200, { ...message, content: [{ type: "text", text: STUB_TEXT }], stop_reason: "end_turn" });
      return sse([
        ["message_start", { type: "message_start", message }],
        ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
        ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: STUB_TEXT } }],
        ["content_block_stop", { type: "content_block_stop", index: 0 }],
        ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 6 } }],
        ["message_stop", { type: "message_stop" }],
      ]);
    }
    if (path.endsWith("/responses")) {
      const item = { type: "message", id: "msg_stub", role: "assistant", status: "completed", content: [{ type: "output_text", text: STUB_TEXT, annotations: [] }] };
      const usage = { input_tokens: 12, input_tokens_details: { cached_tokens: 0 }, output_tokens: 6, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 18 };
      const response = { id: "resp_stub", object: "response", model, status: "completed", output: [item], usage };
      return sse([
        ["response.created", { type: "response.created", response: { ...response, status: "in_progress", output: [] } }],
        ["response.output_item.added", { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } }],
        ["response.output_text.delta", { type: "response.output_text.delta", output_index: 0, content_index: 0, item_id: "msg_stub", delta: STUB_TEXT }],
        ["response.output_item.done", { type: "response.output_item.done", output_index: 0, item }],
        ["response.completed", { type: "response.completed", response }],
      ]);
    }
    if (path.endsWith("/models")) return json(200, { object: "list", data: [], models: [] });
    return json(404, { error: { type: "not_found", message: `stub has no ${path}` } });
  });
  server.on("connection", () => {
    state.connections += 1;
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  state.port = server.address().port;
  state.close = () => server.close();
  return state;
}

// ---- Mode: harness ----------------------------------------------------------------------------

async function harnessMode() {
  const harnessRoot = process.env.SPIKE_HARNESS_DIR ?? join(base, "harnesses");
  const claudeExe = findFile(join(harnessRoot, "node_modules", "@anthropic-ai"), "claude.exe");
  const codexExe = findFile(join(harnessRoot, "node_modules", "@openai"), "codex.exe", 10);
  const gitExe = where("git");
  const gitRoot = gitExe ? dirname(dirname(gitExe)) : null;
  const gitBash = gitRoot ? join(gitRoot, "bin", "bash.exe") : null;
  const out = { paths: { claudeExe, codexExe, gitBash }, claude: {}, codex: {} };
  const bridge = await stubBridge();
  const placeholderKey = "stub-key-not-a-secret";

  const tryPolicies = async (name, label, command, { work, read, env, needsBridge }) => {
    // Plain policy first; only on failure, the round 3 pnpm fixes (temp in work, enumerate on the root).
    const variants = [
      { tag: "plain", env, containmentConfig: undefined },
      { tag: "temp+enumerateRoot", env: { ...env, ...tempInWork(work) }, containmentConfig: { filesystem: { enumeratePaths: [drive] } } },
    ];
    const nets = needsBridge ? [["bridgeOnly", network.bridgeOnly(bridge.port)], ["bridgeOnlyLoopbackAllowed", network.bridgeOnlyLoopbackAllowed(bridge.port)]] : [["closed", network.closed]];
    const results = [];
    for (const v of variants) {
      for (const [netName, net] of nets) {
        const before = bridge.requests.length;
        const r = await inBox(`${name} ${label} [${v.tag}, ${netName}]`, command, { work, read, net, env: v.env, containmentConfig: v.containmentConfig, timeoutMs: 180_000 });
        r.variant = v.tag;
        r.net = netName;
        r.bridgeRequests = bridge.requests.slice(before);
        r.sawStubText = r.stdout?.includes(STUB_TEXT) ?? false;
        results.push(r);
        if (r.ok && (!needsBridge || r.bridgeRequests.length > 0)) return results;
      }
    }
    return results;
  };

  if (claudeExe) {
    const work = mkdtempSync(join(base, "claude-"));
    const claudeDir = dirname(claudeExe);
    const read = [harnessRoot, gitRoot, sysRoot];
    const env = {
      CLAUDE_CONFIG_DIR: join(work, "claude-config"),
      CLAUDE_CODE_TMPDIR: join(work, "claude-tmp"),
      CLAUDE_CODE_GIT_BASH_PATH: gitBash,
      DISABLE_AUTOUPDATER: "1",
      DISABLE_TELEMETRY: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      PATH: [claudeDir, gitRoot && join(gitRoot, "cmd"), `${sysRoot}\\System32`, sysRoot].filter(Boolean).join(";"),
    };
    mkdirSync(env.CLAUDE_CONFIG_DIR, { recursive: true });
    mkdirSync(env.CLAUDE_CODE_TMPDIR, { recursive: true });
    out.claude.version = await tryPolicies("claude", "--version", `${q(claudeExe)} --version`, { work, read, env });
    if (out.claude.version.some((r) => r.ok)) {
      const runEnv = { ...env, ANTHROPIC_BASE_URL: `http://127.0.0.1:${bridge.port}`, ANTHROPIC_API_KEY: placeholderKey };
      const cmd = `${q(claudeExe)} -p "Reply with one short greeting." --output-format text --max-turns 1`;
      out.claude.run = await tryPolicies("claude", "-p", cmd, { work, read, env: runEnv, needsBridge: true });
    }
  }
  if (codexExe) {
    const work = mkdtempSync(join(base, "codex-"));
    const codexHome = join(work, "codex-home");
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(
      join(codexHome, "config.toml"),
      [
        'model = "stub-model"',
        'model_provider = "stub"',
        "",
        "[model_providers.stub]",
        'name = "Halonic stub"',
        `base_url = "http://127.0.0.1:${bridge.port}/v1"`,
        'wire_api = "responses"',
        'env_key = "STUB_API_KEY"',
        "",
      ].join("\n"),
    );
    const read = [harnessRoot, gitRoot, sysRoot];
    const env = {
      CODEX_HOME: codexHome,
      STUB_API_KEY: placeholderKey,
      PATH: [dirname(codexExe), gitRoot && join(gitRoot, "cmd"), `${sysRoot}\\System32`, sysRoot].filter(Boolean).join(";"),
    };
    out.codex.version = await tryPolicies("codex", "--version", `${q(codexExe)} --version`, { work, read, env });
    if (out.codex.version.some((r) => r.ok)) {
      const cmd = `${q(codexExe)} exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox "Reply with one short greeting."`;
      out.codex.run = await tryPolicies("codex", "exec", cmd, { work, read, env, needsBridge: true });
    }
  }
  bridge.close();
  const verdict = (runs) => {
    if (!runs) return "not run";
    const win = runs.find((r) => r.ok && (r.bridgeRequests === undefined || r.net === "closed" || r.bridgeRequests.length > 0));
    if (win) return `PASS (${win.variant}, ${win.net})`;
    return `FAIL: ${runs[0].spawnError ?? runs[0].waitError ?? runs[0].firstError ?? `exit ${runs[0].hex}`}`;
  };
  out.verdict = {
    claudeVersion: claudeExe ? verdict(out.claude.version) : "not installed",
    claudeRun: verdict(out.claude.run),
    codexVersion: codexExe ? verdict(out.codex.version) : "not installed",
    codexRun: verdict(out.codex.run),
  };
  for (const [k, v] of Object.entries(out.verdict)) console.log(`RESULT harness ${k}: ${v}`);
  return out;
}

// ---- Mode: network ----------------------------------------------------------------------------

async function networkMode() {
  const work = mkdtempSync(join(base, "net-"));
  const bridge = await countingListener();
  const other = await countingListener();
  // No "-o NUL": keep the null device out of the picture (round 2 needed host prep for it on the DACL tier).
  const curl = (target) => `curl.exe -sS -m 8 -w " http=%{http_code}" ${target}`;
  const outsideByName = "https://example.com/";
  const outsideByIp = "http://1.1.1.1/";
  const hostControl = Object.fromEntries(
    [outsideByName, outsideByIp].map((u) => {
      const r = spawnSync("curl.exe", ["-sS", "-m", "8", "-o", "NUL", "-w", "%{http_code}", u], { encoding: "utf8" });
      return [u, { exit: r.status, code: r.stdout.trim() }];
    }),
  );
  const out = { ports: { bridge: bridge.port, other: other.port }, hostControl, cases: {} };

  const probe = async (name, target, listener, net) => {
    const before = listener?.connections ?? 0;
    const r = await inBox(`network ${name}`, curl(target), { work, net, timeoutMs: 30_000 });
    r.connectionsSeen = listener ? listener.connections - before : null;
    out.cases[name] = r;
    return r;
  };
  const policies = { bridgeOnly: network.bridgeOnly(bridge.port), bridgeOnlyLoopbackAllowed: network.bridgeOnlyLoopbackAllowed(bridge.port) };
  for (const [pname, net] of Object.entries(policies)) {
    await probe(`${pname}: bridge port`, `http://127.0.0.1:${bridge.port}/`, bridge, net);
    await probe(`${pname}: second loopback port`, `http://127.0.0.1:${other.port}/`, other, net);
    await probe(`${pname}: outside by name`, outsideByName, null, net);
    await probe(`${pname}: outside by IP`, outsideByIp, null, net);
  }
  // Open control: the second port IS reachable when host loopback is open, so "not reached" above means something.
  await probe("control loopbackOpen: second loopback port", `http://127.0.0.1:${other.port}/`, other, network.loopbackOpen);

  const reached = (c) => c?.ok && c.connectionsSeen > 0;
  const blocked = (c) => !c?.ok && (c?.connectionsSeen ?? 0) === 0;
  const policyVerdict = (pname) => {
    const c = (k) => out.cases[`${pname}: ${k}`];
    return {
      bridgeReached: reached(c("bridge port")),
      secondPortBlocked: blocked(c("second loopback port")),
      outsideByNameBlocked: blocked(c("outside by name")),
      outsideByIpBlocked: blocked(c("outside by IP")),
    };
  };
  out.verdict = {
    bridgeOnly: policyVerdict("bridgeOnly"),
    bridgeOnlyLoopbackAllowed: policyVerdict("bridgeOnlyLoopbackAllowed"),
    openControlValid: reached(out.cases["control loopbackOpen: second loopback port"]),
    hostReachesOutside: Object.values(hostControl).some((h) => h.exit === 0),
  };

  // Streams and kill, under the bridge-only policy: a Node parent with a child and a detached grandchild,
  // each writing a heartbeat file. stdin echo, stdout streaming, then kill() and check that all three stop.
  out.streamsAndKill = await streamsAndKill(work, policies.bridgeOnly);
  bridge.close();
  other.close();
  const v = out.verdict.bridgeOnly;
  console.log(`RESULT network bridgeOnly: bridge reached=${v.bridgeReached}, second port blocked=${v.secondPortBlocked}, outside blocked=${v.outsideByNameBlocked && v.outsideByIpBlocked}, open control valid=${out.verdict.openControlValid}`);
  const w = out.verdict.bridgeOnlyLoopbackAllowed;
  console.log(`RESULT network bridgeOnlyLoopbackAllowed: bridge reached=${w.bridgeReached}, second port blocked=${w.secondPortBlocked}, outside blocked=${w.outsideByNameBlocked && w.outsideByIpBlocked}`);
  const k = out.streamsAndKill.verdict;
  console.log(`RESULT network streams+kill: ${JSON.stringify(k)}`);
  return out;
}

async function streamsAndKill(work, net) {
  const nodeExe = process.execPath;
  const heartbeat = (name) => join(work, `hb-${name}.txt`);
  // The heartbeat line expects writeFileSync in scope; the parent script imports it itself.
  const beatLine = (name) => `setInterval(()=>writeFileSync(${JSON.stringify(heartbeat(name))},String(Date.now())),100);`;
  const beatScript = (name) => `import{writeFileSync}from"node:fs";${beatLine(name)}`;
  writeFileSync(join(work, "beat-child.mjs"), beatScript("child"));
  writeFileSync(join(work, "beat-grandchild.mjs"), beatScript("grandchild"));
  writeFileSync(
    join(work, "parent.mjs"),
    `import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
const node = process.execPath;
const child = spawn(node, ["--preserve-symlinks", "--preserve-symlinks-main", ${JSON.stringify(join(work, "beat-child.mjs"))}], { stdio: "ignore" });
const grandchild = spawn(node, ["--preserve-symlinks", "--preserve-symlinks-main", ${JSON.stringify(join(work, "beat-grandchild.mjs"))}], { stdio: "ignore", detached: true });
grandchild.unref();
writeFileSync(${JSON.stringify(join(work, "pids.json"))}, JSON.stringify({ parent: process.pid, child: child.pid, grandchild: grandchild.pid }));
${beatLine("parent")}
let n = 0;
setInterval(() => console.log("tick " + ++n), 200);
console.log("ready");
createInterface({ input: process.stdin }).on("line", (l) => console.log("echo:" + l));
`,
  );
  const waitFor = async (output, text, ms) => {
    const until = performance.now() + ms;
    while (performance.now() < until) {
      if (output.stdout.includes(text)) return true;
      await sleep(50);
    }
    return false;
  };
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error.code === "EPERM"; // exists, but we may not signal it
    }
  };
  const mtimes = () => Object.fromEntries(["parent", "child", "grandchild"].map((n) => [n, existsSync(heartbeat(n)) ? statSync(heartbeat(n)).mtimeMs : null]));
  const rec = await inBox("network streams+kill", `${q(nodeExe)} ${q(join(work, "parent.mjs"))}`, {
    work,
    read: [dirname(nodeExe)],
    net,
    timeoutMs: 60_000,
    onStart: async (proc, output) => {
      const d = {};
      d.ready = await waitFor(output, "ready", 20_000);
      d.stdinTaken = proc.standardInput != null;
      proc.standardInput?.write("ping\n");
      d.stdinEcho = await waitFor(output, "echo:ping", 5_000);
      d.ticksBeforeKill = (output.stdout.match(/tick/g) ?? []).length;
      await sleep(1_000);
      d.pids = existsSync(join(work, "pids.json")) ? JSON.parse(readFileSync(join(work, "pids.json"), "utf8")) : null;
      d.heartbeatsBeforeKill = mtimes();
      d.aliveBeforeKill = d.pids ? Object.fromEntries(Object.entries(d.pids).map(([k, pid]) => [k, alive(pid)])) : null;
      proc.kill();
      d.killedAtMs = Math.round(performance.now());
      return d;
    },
  });
  await sleep(1_500);
  const after1 = mtimes();
  await sleep(1_500);
  const after2 = mtimes();
  const d = rec.drive ?? {};
  const aliveAfterKill = d.pids ? Object.fromEntries(Object.entries(d.pids).map(([k, pid]) => [k, alive(pid)])) : null;
  const tasklist = d.pids ? spawnSync("tasklist.exe", ["/FO", "CSV", "/NH", "/FI", `PID eq ${d.pids.grandchild}`], { encoding: "utf8" }).stdout.trim() : null;
  const stillBeating = Object.keys(after2).filter((n) => after2[n] != null && after2[n] !== after1[n]);
  rec.heartbeatsAfterKill = { after1, after2 };
  rec.aliveAfterKill = aliveAfterKill;
  rec.tasklistGrandchild = tasklist;
  rec.verdict = {
    streamedBeforeExit: rec.firstStdoutMs != null && d.ready === true,
    stdinWorks: d.stdinEcho === true,
    allStartedBeforeKill: d.heartbeatsBeforeKill ? Object.values(d.heartbeatsBeforeKill).every((m) => m != null) : false,
    killEndedAll: stillBeating.length === 0 && (aliveAfterKill ? Object.values(aliveAfterKill).every((a) => !a) : false),
    stillBeating,
    waitAfterKill: { exit: rec.exit, hex: rec.hex, timedOut: rec.timedOut, waitError: rec.waitError },
  };
  // Clean up any survivor so the runner is not left with stray processes.
  if (d.pids) for (const pid of Object.values(d.pids)) if (alive(pid)) spawnSync("taskkill.exe", ["/F", "/T", "/PID", String(pid)]);
  return rec;
}

// ---- Mode: denials ----------------------------------------------------------------------------

async function denialsMode() {
  // Round 1 of this mode died with exit 1 and no output at all; log each step so the next run shows where.
  try {
    console.error(`denials: backends ${JSON.stringify(getAvailableBackends())}`);
  } catch (error) {
    console.error(`denials: getAvailableBackends failed: ${error?.message ?? error}`);
  }
  const work = mkdtempSync(join(base, "den-"));
  const hidden = mkdtempSync(join(base, "hidden-"));
  const canary = join(hidden, "canary.txt");
  writeFileSync(canary, "canary");
  const bridge = await countingListener();
  const other = await countingListener();
  const net = network.bridgeOnly(bridge.port);
  const out = { canary, ports: { bridge: bridge.port, other: other.port }, cases: {} };
  const capture = (name, mode = "block") => ({ captureDenials: { mode, outputPath: join(work, `denials-${name}.json`), retainEtl: false } });
  const readReport = (rec) => {
    const path = rec.meta?.captureDenials?.outputPath;
    if (!path || !existsSync(path)) return null;
    const text = readFileSync(path, "utf8");
    return { bytes: text.length, mentionsCanary: text.toLowerCase().includes("canary.txt"), mentionsOtherPort: text.includes(String(other.port)), mentionsOutsideIp: text.includes("1.1.1.1"), excerpt: text.slice(0, 4000) };
  };
  // No quotes: the paths have no spaces, and cmd.exe's /c quote handling stays out of the way.
  const cmdLine = [
    `type ${canary}`,
    `curl.exe -sS -m 5 http://127.0.0.1:${other.port}/`,
    "curl.exe -sS -m 5 http://1.1.1.1/",
    `curl.exe -sS -m 5 http://127.0.0.1:${bridge.port}/`,
  ].join(" & ");
  const nodeExe = process.execPath;
  const nodeChild = join(work, "deny.mjs");
  writeFileSync(
    nodeChild,
    `import { readFileSync } from "node:fs";
import { connect } from "node:net";
try { readFileSync(${JSON.stringify(canary)}); console.log("file: read"); } catch (e) { console.log("file: " + e.code); }
await new Promise((done) => { const s = connect({ host: "127.0.0.1", port: ${other.port} }); const f = (o) => { console.log("port: " + o); s.destroy(); done(); }; s.setTimeout(4000, () => f("timeout")); s.on("connect", () => f("reached")); s.on("error", (e) => f(e.code)); });
`,
  );
  const cases = {
    "native, block": { cmd: `cmd.exe /d /c ${cmdLine}`, config: capture("native-block") },
    "node, block": { cmd: `${q(nodeExe)} ${q(nodeChild)}`, read: [dirname(nodeExe)], config: capture("node-block") },
    "native, allow (learning)": { cmd: `cmd.exe /d /c ${cmdLine}`, config: capture("native-allow", "allow") },
  };
  for (const [name, c] of Object.entries(cases)) {
    const before = other.connections;
    console.error(`denials ${name}: starting`);
    const r = await inBox(`denials ${name}`, c.cmd, { work, read: c.read, net, containmentConfig: c.config, timeoutMs: 120_000 });
    r.otherPortConnections = other.connections - before;
    r.report = readReport(r);
    out.cases[name] = r;
  }
  bridge.close();
  other.close();
  const summarise = (r) => ({
    captured: r.meta?.captureDenials != null,
    totalDenials: r.meta?.captureDenials?.totalDenials ?? null,
    captureError: r.meta?.captureDenialsError?.message ?? r.spawnError ?? null,
    fileDenialSeen: r.report?.mentionsCanary ?? false,
    networkDenialSeen: (r.report?.mentionsOtherPort || r.report?.mentionsOutsideIp) ?? false,
  });
  out.verdict = Object.fromEntries(Object.entries(out.cases).map(([k, r]) => [k, summarise(r)]));
  for (const [k, v] of Object.entries(out.verdict)) console.log(`RESULT denials ${k}: ${JSON.stringify(v)}`);
  return out;
}

// ---- Mode: pnpm -------------------------------------------------------------------------------

async function pnpmMode() {
  const ws = join(base, "ws"), store = join(base, "pnpm-store"), home = join(base, "pnpm-home");
  rmSync(ws, { recursive: true, force: true });
  for (const d of [ws, join(ws, "packages", "app"), store, home]) mkdirSync(d, { recursive: true });
  const w = (f, s) => writeFileSync(join(ws, f), s);
  w("package.json", JSON.stringify({ name: "root", private: true, scripts: { build: "pnpm -r run build" } }, null, 2));
  w("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
  w("packages/app/package.json", JSON.stringify({ name: "app", version: "1.0.0", private: true, scripts: { build: "node build.mjs" } }, null, 2));
  w("packages/app/build.mjs", 'import { mkdirSync, writeFileSync } from "node:fs";\nmkdirSync("dist", { recursive: true });\nwriteFileSync("dist/out.txt", "built by node " + process.version);\nconsole.log("build ok");\n');
  const hostEnv = { ...process.env, npm_config_store_dir: store };
  const fill = spawnSync("cmd.exe", ["/c", "pnpm", "install"], { cwd: ws, env: hostEnv, encoding: "utf8" });
  console.error(`host pnpm install: exit ${fill.status}`);

  const hidden = mkdtempSync(join(base, "hidden-"));
  const canary = join(hidden, "canary.txt");
  writeFileSync(canary, "canary");
  const nodeDir = dirname(process.execPath);
  const pnpmDir = dirname(where("pnpm.cmd"));
  const read = [nodeDir, pnpmDir, sysRoot];
  const env = {
    PATH: [nodeDir, pnpmDir, `${sysRoot}\\System32`, sysRoot].join(";"),
    npm_config_store_dir: store,
    PNPM_HOME: home,
    XDG_CACHE_HOME: join(home, "cache"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_STATE_HOME: join(home, "state"),
    npm_config_update_notifier: "false",
    COREPACK_ENABLE_AUTO_PIN: "0",
  };
  const enumerateRoot = { filesystem: { enumeratePaths: [drive] } };
  const variants = {
    baseline: {},
    "a: temp in work": { env: tempInWork(ws) },
    "b: enumerate root": { containmentConfig: enumerateRoot },
    "a+b": { env: tempInWork(ws), containmentConfig: enumerateRoot },
  };
  const cmd = (c) => `cmd.exe /d /c ${c}`;
  const out = { paths: { nodeDir, pnpmDir }, variants: {} };
  for (const [name, v] of Object.entries(variants)) {
    const opts = { work: ws, read, write: [store, home], env: { ...env, ...(v.env ?? {}) }, containmentConfig: v.containmentConfig, timeoutMs: 180_000 };
    rmSync(join(ws, "packages", "app", "dist"), { recursive: true, force: true });
    const rec = {};
    rec.pnpmVersion = await inBox(`pnpm ${name} / pnpm -v`, cmd("pnpm -v"), opts);
    rec.install = await inBox(`pnpm ${name} / pnpm install --offline`, cmd("pnpm install --offline --frozen-lockfile"), opts);
    rec.build = await inBox(`pnpm ${name} / pnpm run build`, cmd("pnpm run build"), opts);
    rec.buildOutputOnHost = existsSync(join(ws, "packages", "app", "dist", "out.txt"));
    rec.canaryRead = await inBox(`pnpm ${name} / hidden canary`, cmd(`type ${canary}`), opts);
    rec.listRoot = await inBox(`pnpm ${name} / dir root`, cmd(`dir /b ${drive}`), opts);
    rec.listHiddenFolder = await inBox(`pnpm ${name} / dir hidden folder`, cmd(`dir /b ${hidden}`), opts);
    rec.verdict = {
      pnpmVersion: rec.pnpmVersion.ok ? "PASS" : `FAIL: ${rec.pnpmVersion.spawnError ?? rec.pnpmVersion.firstError ?? rec.pnpmVersion.hex}`,
      build: rec.build.ok && rec.buildOutputOnHost ? "PASS" : `FAIL: ${rec.build.spawnError ?? rec.build.firstError ?? rec.build.hex}`,
      canaryHolds: !rec.canaryRead.ok && !rec.canaryRead.stdout?.includes("canary"),
      rootListable: rec.listRoot.ok,
      hiddenFolderListable: rec.listHiddenFolder.ok && rec.listHiddenFolder.stdout.includes("canary.txt"),
    };
    out.variants[name] = rec;
    console.log(`RESULT pnpm ${name}: ${JSON.stringify(rec.verdict)}`);
  }
  return out;
}

// ---- Main -------------------------------------------------------------------------------------

const report = { mode, support: undefined, result: undefined };
try {
  report.support = getPlatformSupport();
} catch (error) {
  report.support = { error: String(error) };
}
const modes = { harness: harnessMode, network: networkMode, denials: denialsMode, pnpm: pnpmMode };
try {
  report.result = await modes[mode]();
} catch (error) {
  report.error = String(error?.stack ?? error).slice(0, 1500);
  console.log(`RESULT ${mode}: probe crashed: ${String(error?.message ?? error).split("\n")[0]}`);
}
console.log(JSON.stringify(report));
process.exit(0);
