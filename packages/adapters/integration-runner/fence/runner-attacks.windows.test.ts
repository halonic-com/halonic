import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createSocket, type Socket as UdpSocket } from "node:dgram";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { join } from "node:path";
import { createHostSandbox } from "@halonicjs/adapter-sandbox-host";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type AttackFolders,
  attackFolders,
  fenceTestBase,
  type NodeLayer,
  runAttack,
} from "./attack-session.ts";

// The runner's attack list on native Windows (design HAL-958, sections 4.3 and
// 6). There the runner has no OS fence: Halonic starts it through the launcher
// (`sandbox-host`) once the user has confirmed, so Node's permission model is
// the only layer. Run by the `sandbox-windows` CI job
// (`vitest.fence-windows.config.ts`), with Node's layer on as in production.
//
// The cases Node's layer doesn't stop are the known gaps: A4 and A6 DNS, A16
// and A39 signals, A35 sockets, A36 the Credential Manager. They expect
// `allowed`, so a gap that closes fails too and the list stays true. Every
// other case expects `refused`, so a gap that opens fails.

const sandbox = createHostSandbox();
/** The Windows folder, where `cmd.exe` and `cmdkey.exe` are. Windows always sets it. */
const windowsFolder = process.env["SystemRoot"] ?? "";

/** A value that must never come back out of the runner, unless a known gap lets it. */
const canary = `canary-${Math.random().toString(36).slice(2)}`;
/** The Credential Manager entry A36 looks for. */
const credentialTarget = `halonic-fence-attack-${Math.random().toString(36).slice(2)}`;

let base: string;
let homeFolder: string;
let homeKey: string;
let workspaceEnv: string;
let agentPipe: string;
let agentConnections = 0;
let agent: Server;
let resolver: UdpSocket;
let resolverPort: number;
let resolverQueries = 0;
const victims: ChildProcess[] = [];

beforeAll(async () => {
  base = await fenceTestBase("ra-");
  // A home folder of its own, so the test never touches the real one.
  homeFolder = join(base, "home");
  homeKey = join(homeFolder, ".ssh", "id_ed25519");
  workspaceEnv = join(homeFolder, "acme", ".env");
  await mkdir(join(homeFolder, ".ssh"), { recursive: true });
  await mkdir(join(homeFolder, "acme"), { recursive: true });
  await writeFile(homeKey, canary);
  await writeFile(workspaceEnv, `API_KEY=${canary}\n`);

  // A named pipe, where Windows programs such as ssh-agent and Docker listen (A35).
  agentPipe = `\\\\.\\pipe\\halonic-attack-${Math.random().toString(36).slice(2)}`;
  agent = createServer((connection) => {
    agentConnections += 1;
    connection.end(canary);
  });
  await new Promise<void>((resolve) => agent.listen(agentPipe, resolve));

  // A DNS server on this computer that only counts what reaches it (A6).
  resolver = createSocket("udp4");
  resolver.on("message", () => {
    resolverQueries += 1;
  });
  await new Promise<void>((resolve) => resolver.bind(0, "127.0.0.1", resolve));
  resolverPort = resolver.address().port;

  // A generic credential, as a program stores a key in the Credential Manager (A36).
  execFileSync("cmdkey", [`/generic:${credentialTarget}`, "/user:halonic-ci", `/pass:${canary}`]);
});

afterAll(async () => {
  for (const victim of victims) victim.kill("SIGKILL");
  await new Promise<void>((resolve) => (agent ? agent.close(() => resolve()) : resolve()));
  resolver?.close();
  try {
    execFileSync("cmdkey", [`/delete:${credentialTarget}`]);
  } catch {
    // Not there when `beforeAll` failed before adding it.
  }
  await rm(base, { recursive: true, force: true });
});

let runs = 0;

/** Runs `script` in a fresh integration folder in the runner's profile, through the launcher. */
async function attack(script: string, nodeLayer: NodeLayer = "on", folders?: AttackFolders) {
  runs += 1;
  return runAttack({
    sandbox,
    folders: folders ?? (await attackFolders(base, `${nodeLayer}-${runs}`)),
    script,
    nodeLayer,
    // Windows has no socket folders: its programs listen on named pipes (A35).
    hidden: { homeFolder, socketFolders: [] },
    sandboxFolders: [],
  });
}

/** A process outside the runner for it to try to signal or end. */
function startVictim(): number {
  const victim = spawn(process.execPath, ["-e", "setTimeout(() => {}, 120000)"], {
    stdio: "ignore",
  });
  victims.push(victim);
  return victim.pid as number;
}

/** Whether a process is still running, from outside the runner. */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Waits until a process has gone, for up to five seconds: Windows ends it a moment after the call. */
async function hasEnded(pid: number): Promise<boolean> {
  for (let tries = 0; tries < 50; tries += 1) {
    if (!isRunning(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

describe("an integration in the runner on native Windows, Node's layer only", () => {
  it("A4: reaches no address around the kit, but resolves a name (known gap)", async () => {
    const { attempts } = await attack(`
      const net = await import("node:net");
      const dns = await import("node:dns");
      await attempt("raw connection", () => new Promise((resolve, reject) => {
        const socket = net.connect({ host: "1.1.1.1", port: 443 });
        socket.setTimeout(5000, () => { socket.destroy(); reject(Object.assign(new Error("timeout"), { code: "TIMEOUT" })); });
        socket.on("connect", () => { socket.destroy(); resolve("connected"); });
        socket.on("error", reject);
      }));
      await attempt("global fetch", async () => (await fetch("https://example.com/", { signal: AbortSignal.timeout(5000) })).status);
      await attempt("name lookup", async () => JSON.stringify(await dns.promises.lookup("example.com")));
    `);
    expect(attempts["raw connection"]?.outcome).toBe("refused");
    expect(attempts["global fetch"]?.outcome).toBe("refused");
    // Known gap: nothing below Node stops a lookup, so a name can carry data out.
    expect(attempts["name lookup"]?.outcome).toBe("allowed");
  });

  it("A6: sends a DNS query to a server it names itself (known gap)", async () => {
    const queriesBefore = resolverQueries;
    const { attempts } = await attack(`
      const { Resolver } = await import("node:dns/promises");
      const resolver = new Resolver({ timeout: 1000, tries: 1 });
      resolver.setServers(["127.0.0.1:${resolverPort}"]);
      await attempt("query", async () => JSON.stringify(await resolver.resolve4("probe.example.com")));
    `);
    // The test's server never answers, so the query times out inside the runner.
    expect(attempts["query"]?.outcome).not.toBe("allowed");
    expect(resolverQueries).toBeGreaterThan(queriesBefore);
  });

  it("A12: reads nothing in the home folder or outside the integration's folder", async () => {
    const outside = join(import.meta.dirname, "..", "package.json");
    const { attempts } = await attack(`
      const fs = await import("node:fs/promises");
      await attempt("ssh key", () => fs.readFile(${JSON.stringify(homeKey)}, "utf8"));
      await attempt("workspace .env", () => fs.readFile(${JSON.stringify(workspaceEnv)}, "utf8"));
      await attempt("list home", async () => (await fs.readdir(${JSON.stringify(homeFolder)})).join(","));
      await attempt("outside file", () => fs.readFile(${JSON.stringify(outside)}, "utf8"));
      await attempt("Windows folder", async () => (await fs.readdir(${JSON.stringify(windowsFolder)})).length);
    `);
    for (const name of [
      "ssh key",
      "workspace .env",
      "list home",
      "outside file",
      "Windows folder",
    ]) {
      expect(attempts[name], name).toMatchObject({
        outcome: "refused",
        detail: "ERR_ACCESS_DENIED",
      });
    }
  });

  it("A13: writes nothing, not even in its temp folder, and can't replace its own code", async () => {
    const folders = await attackFolders(base, "a13");
    const { attempts } = await attack(
      `
      const fs = await import("node:fs/promises");
      await attempt("own code", () => fs.writeFile(${JSON.stringify(join(folders.integrationFolder, "attack.mjs"))}, "replaced"));
      await attempt("next to its folder", () => fs.writeFile(${JSON.stringify(join(base, "planted.txt"))}, "planted"));
      await attempt("home folder", () => fs.writeFile(${JSON.stringify(join(homeFolder, "planted.txt"))}, "planted"));
      await attempt("temp folder", () => fs.writeFile(${JSON.stringify(join(folders.tempFolder, "scratch.txt"))}, "scratch"));
      `,
      "on",
      folders,
    );
    for (const name of ["own code", "next to its folder", "home folder", "temp folder"]) {
      expect(attempts[name], name).toMatchObject({
        outcome: "refused",
        detail: "ERR_ACCESS_DENIED",
      });
    }
    expect(existsSync(join(base, "planted.txt"))).toBe(false);
    expect(existsSync(join(homeFolder, "planted.txt"))).toBe(false);
  });

  it("A14: starts no process, also not a shell", async () => {
    const cmd = join(windowsFolder, "System32", "cmd.exe");
    const { attempts } = await attack(`
      const { spawnSync } = await import("node:child_process");
      await attempt("shell", () => {
        const run = spawnSync(${JSON.stringify(cmd)}, ["/d", "/c", "echo started"], { encoding: "utf8" });
        if (run.error) throw run.error;
        return run.stdout;
      });
    `);
    expect(attempts["shell"]).toMatchObject({ outcome: "refused", detail: "ERR_ACCESS_DENIED" });
  });

  it("A15: starts no worker, add-on, WASI or inspector", async () => {
    const folders = await attackFolders(base, "a15");
    const { attempts } = await attack(
      `
      const { Worker } = await import("node:worker_threads");
      await attempt("worker", () => new Promise((resolve, reject) => {
        const worker = new Worker("process.exit(0)", { eval: true });
        worker.on("error", reject);
        worker.on("exit", () => resolve("ran"));
      }));
      await attempt("wasi", async () => { const { WASI } = await import("node:wasi"); new WASI({ version: "preview1" }); return "created"; });
      await attempt("add-on", () => { process.dlopen({ exports: {} }, ${JSON.stringify(join(folders.integrationFolder, "attack.mjs"))}); return "loaded"; });
      await attempt("inspector", async () => { const inspector = await import("node:inspector"); inspector.open(0, "127.0.0.1"); const url = inspector.url(); inspector.close(); return url; });
      `,
      "on",
      folders,
    );
    for (const name of ["worker", "wasi", "add-on", "inspector"]) {
      expect(attempts[name], name).toMatchObject({ outcome: "refused" });
    }
  });

  it("A16: ends another process with a signal (known gap)", async () => {
    const pid = startVictim();
    const { attempts } = await attack(
      `await attempt("signal", () => process.kill(${pid}, "SIGTERM"));`,
    );
    expect(attempts["signal"]?.outcome).toBe("allowed");
    expect(await hasEnded(pid)).toBe(true);
  });

  it("A17: sees only TMPDIR in its environment", async () => {
    // The launcher passes the profile's variables and nothing else, so no
    // Halonic variable, no user profile folder and no key gets in.
    const { attempts } = await attack(
      `await attempt("environment", () => Object.keys(process.env).sort().join(","));`,
    );
    expect(attempts["environment"]).toEqual({ outcome: "allowed", detail: "TMPDIR" });
  });

  it("A35: connects to a named pipe on this computer (known gap)", async () => {
    const connectionsBefore = agentConnections;
    const { attempts } = await attack(`
      const net = await import("node:net");
      await attempt("agent pipe", () => new Promise((resolve, reject) => {
        const socket = net.connect({ path: ${JSON.stringify(agentPipe)} });
        let got = "";
        socket.on("data", (chunk) => { got += chunk; });
        socket.on("end", () => resolve(got || "connected"));
        socket.on("error", reject);
      }));
    `);
    expect(attempts["agent pipe"]).toEqual({ outcome: "allowed", detail: canary });
    expect(agentConnections).toBe(connectionsBefore + 1);
  });

  it("A36: reaches the Credential Manager once past Node's layer (known gap)", async () => {
    // With Node's layer on, the runner can't start the program that asks for
    // the credential. Without it, nothing else stands in the way: Windows has
    // no fence around the runner, so the credential's entry is there to read.
    const cmdkey = join(windowsFolder, "System32", "cmdkey.exe");
    const script = `
      const { spawnSync } = await import("node:child_process");
      await attempt("credential", () => {
        const run = spawnSync(${JSON.stringify(cmdkey)}, [${JSON.stringify(`/list:${credentialTarget}`)}], { encoding: "utf8" });
        if (run.error) throw run.error;
        if (run.status !== 0) throw Object.assign(new Error(run.stdout), { code: "EXIT_" + run.status });
        return run.stdout.includes(${JSON.stringify(credentialTarget)}) ? "listed" : run.stdout;
      });
    `;
    const withLayer = await attack(script, "on");
    expect(withLayer.attempts["credential"]).toMatchObject({
      outcome: "refused",
      detail: "ERR_ACCESS_DENIED",
    });
    const withoutLayer = await attack(script, "off");
    expect(withoutLayer.attempts["credential"]).toEqual({ outcome: "allowed", detail: "listed" });
  });

  it("A39: ends Halonic's host with a signal (known gap)", async () => {
    // A stand-in for Halonic's own process: the runner's parent here is the
    // test, which must keep running to report.
    const host = startVictim();
    const { attempts } = await attack(
      `await attempt("end the host", () => process.kill(${host}, "SIGKILL"));`,
    );
    expect(attempts["end the host"]?.outcome).toBe("allowed");
    expect(await hasEnded(host)).toBe(true);
  });
});
