import { execFileSync, spawn } from "node:child_process";
import { createSocket, type Socket as UdpSocket } from "node:dgram";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type AttackFolders,
  attackFolders,
  fenceTestBase,
  type NodeLayer,
  openAttack,
  runAttack,
} from "./attack-session.ts";
import { type RealMxc, realMxc } from "./mxc-sandbox.ts";

// The runner's attack list in MXC on Windows 11 (design HAL-958, sections 4.3
// and 6; HAL-3403). Each case runs in a real `sandbox-mxc` box with the
// runner's own MXC profile: read grants, one folder to write in, no network.
// Run by the `sandbox-mxc-fence` CI job on `windows-11-arm`
// (`vitest.fence-mxc.config.ts`).
//
// Every case runs twice: with Node's permission model on, as in production,
// and with it off, so the box alone stands between the script and the
// computer. That is what an integration has once it gets past the module hook
// and Node's layer. `mxcFencesRunner` stays off until every case here has
// passed, A6 and A23 included.

let mxc: RealMxc;
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

/** A value that must never come back out of the box. */
const canary = `canary-${Math.random().toString(36).slice(2)}`;
/** The Credential Manager entry A36 looks for. */
const credentialTarget = `halonic-fence-attack-${Math.random().toString(36).slice(2)}`;
/** The Windows folder, where `cmd.exe` and `cmdkey.exe` are. Windows always sets it. */
const windowsFolder = process.env["SystemRoot"] ?? "";

beforeAll(async () => {
  mxc = await realMxc();
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
  await new Promise<void>((resolve) => (agent ? agent.close(() => resolve()) : resolve()));
  resolver?.close();
  try {
    execFileSync("cmdkey", [`/delete:${credentialTarget}`]);
  } catch {
    // Not there when `beforeAll` failed before adding it.
  }
  await mxc?.remove();
});

let runs = 0;

/** Runs `script` in a fresh integration folder in the runner's MXC profile. */
async function attack(script: string, nodeLayer: NodeLayer, folders?: AttackFolders) {
  runs += 1;
  return runAttack({
    sandbox: mxc.sandbox,
    folders: folders ?? (await attackFolders(base, `${nodeLayer}-${runs}`)),
    script,
    nodeLayer,
    hidden: { homeFolder, socketFolders: [] },
    sandboxFolders: [],
    backend: "mxc",
  });
}

const layers: readonly NodeLayer[] = ["on", "off"];

describe.each(layers)("an integration in the runner in MXC, Node's layer %s", (nodeLayer) => {
  it("A4: reaches no address around the kit", async () => {
    const { attempts } = await attack(
      `
      const net = await import("node:net");
      await attempt("raw connection", () => new Promise((resolve, reject) => {
        const socket = net.connect({ host: "1.1.1.1", port: 443 });
        socket.setTimeout(5000, () => { socket.destroy(); reject(Object.assign(new Error("timeout"), { code: "TIMEOUT" })); });
        socket.on("connect", () => { socket.destroy(); resolve("connected"); });
        socket.on("error", reject);
      }));
      await attempt("global fetch", async () => (await fetch("https://example.com/", { signal: AbortSignal.timeout(5000) })).status);
    `,
      nodeLayer,
    );
    expect(attempts["raw connection"]?.outcome).toBe("refused");
    expect(attempts["global fetch"]?.outcome).toBe("refused");
  });

  it("A6: sends no DNS query to a server it names itself", async () => {
    const queriesBefore = resolverQueries;
    const { attempts } = await attack(
      `
      const { Resolver } = await import("node:dns/promises");
      const resolver = new Resolver({ timeout: 1000, tries: 1 });
      resolver.setServers(["127.0.0.1:${resolverPort}"]);
      await attempt("query", async () => JSON.stringify(await resolver.resolve4("probe.example.com")));
    `,
      nodeLayer,
    );
    // Refused before it leaves: the test's server, which counts every query, sees none.
    expect(attempts["query"]?.outcome).toBe("refused");
    expect(resolverQueries).toBe(queriesBefore);
  });

  it("A12: reads nothing in the home folder or outside the integration's folder", async () => {
    const outside = join(import.meta.dirname, "..", "package.json");
    const { attempts } = await attack(
      `
      const fs = await import("node:fs/promises");
      await attempt("ssh key", () => fs.readFile(${JSON.stringify(homeKey)}, "utf8"));
      await attempt("workspace .env", () => fs.readFile(${JSON.stringify(workspaceEnv)}, "utf8"));
      await attempt("list home", async () => (await fs.readdir(${JSON.stringify(homeFolder)})).join(","));
      await attempt("outside file", () => fs.readFile(${JSON.stringify(outside)}, "utf8"));
    `,
      nodeLayer,
    );
    for (const name of ["ssh key", "workspace .env", "list home", "outside file"]) {
      expect(attempts[name]?.outcome, name).toBe("refused");
    }
  });

  it("A13: replaces no code and writes nowhere but its temp folder", async () => {
    const folders = await attackFolders(base, `a13-${nodeLayer}`);
    const { attempts } = await attack(
      `
      const fs = await import("node:fs/promises");
      await attempt("own code", () => fs.writeFile(${JSON.stringify(join(folders.integrationFolder, "attack.mjs"))}, "replaced"));
      await attempt("next to its folder", () => fs.writeFile(${JSON.stringify(join(base, "planted.txt"))}, "planted"));
      await attempt("home folder", () => fs.writeFile(${JSON.stringify(join(homeFolder, "planted.txt"))}, "planted"));
      await attempt("temp folder", () => fs.writeFile(${JSON.stringify(join(folders.tempFolder, "scratch.txt"))}, "scratch"));
      `,
      nodeLayer,
      folders,
    );
    for (const name of ["own code", "next to its folder", "home folder"]) {
      expect(attempts[name]?.outcome, name).toBe("refused");
    }
    expect(existsSync(join(base, "planted.txt"))).toBe(false);
    expect(existsSync(join(homeFolder, "planted.txt"))).toBe(false);
    expect(await readFile(join(folders.integrationFolder, "attack.mjs"), "utf8")).not.toBe(
      "replaced",
    );
    // The one folder it may write to is the one it can write to, with Node's layer off.
    expect(attempts["temp folder"]?.outcome).toBe(nodeLayer === "on" ? "refused" : "allowed");
  });

  it("A35: connects to no named pipe on this computer", async () => {
    const connectionsBefore = agentConnections;
    const { attempts } = await attack(
      `
      const net = await import("node:net");
      await attempt("agent pipe", () => new Promise((resolve, reject) => {
        const socket = net.connect({ path: ${JSON.stringify(agentPipe)} });
        let got = "";
        socket.on("data", (chunk) => { got += chunk; });
        socket.on("end", () => resolve(got || "connected"));
        socket.on("error", reject);
      }));
    `,
      nodeLayer,
    );
    expect(attempts["agent pipe"]?.outcome).toBe("refused");
    expect(agentConnections).toBe(connectionsBefore);
  });

  it("A36: reaches no credential in the Credential Manager", async () => {
    const cmdkey = join(windowsFolder, "System32", "cmdkey.exe");
    const { attempts } = await attack(
      `
      const { spawnSync } = await import("node:child_process");
      await attempt("credential", () => {
        const run = spawnSync(${JSON.stringify(cmdkey)}, [${JSON.stringify(`/list:${credentialTarget}`)}], { encoding: "utf8" });
        if (run.error) throw run.error;
        if (run.status !== 0) throw Object.assign(new Error(run.stdout), { code: "EXIT_" + run.status });
        return run.stdout.includes(${JSON.stringify(credentialTarget)}) ? "listed" : run.stdout;
      });
    `,
      nodeLayer,
    );
    expect(attempts["credential"]?.detail).not.toBe("listed");
  });

  it("A14: starts no process outside what the box allows", async () => {
    // With Node's layer on, no process at all. With it off, a program may start
    // inside the box, but the box's own limits hold (A12, A36 above).
    const cmd = join(windowsFolder, "System32", "cmd.exe");
    const { attempts } = await attack(
      `
      const { spawnSync } = await import("node:child_process");
      await attempt("shell", () => {
        const run = spawnSync(${JSON.stringify(cmd)}, ["/d", "/c", "echo started"], { encoding: "utf8" });
        if (run.error) throw run.error;
        return run.stdout;
      });
    `,
      nodeLayer,
    );
    if (nodeLayer === "on") expect(attempts["shell"]?.outcome).toBe("refused");
    else expect(attempts["shell"]).toBeDefined();
  });

  it("A15: starts no worker, add-on, WASI or inspector with Node's layer on", async () => {
    const folders = await attackFolders(base, `a15-${nodeLayer}`);
    const { attempts } = await attack(
      `
      const { Worker } = await import("node:worker_threads");
      await attempt("worker", () => new Promise((resolve, reject) => {
        const worker = new Worker("process.exit(0)", { eval: true });
        worker.on("error", reject);
        worker.on("exit", () => resolve("ran"));
      }));
      await attempt("add-on", () => { process.dlopen({ exports: {} }, ${JSON.stringify(join(folders.integrationFolder, "attack.mjs"))}); return "loaded"; });
      `,
      nodeLayer,
      folders,
    );
    // Node's layer is what refuses a worker; the add-on is not a binary, so it never loads.
    expect(attempts["add-on"]?.outcome).toBe("refused");
    if (nodeLayer === "on") expect(attempts["worker"]?.outcome).toBe("refused");
  });

  it("A17: sees no key or Halonic variable in its environment", async () => {
    process.env["HALONIC_FENCE_TEST_HOST_SECRET"] = canary;
    try {
      const { attempts } = await attack(
        `await attempt("environment", () => JSON.stringify(process.env));`,
        nodeLayer,
      );
      expect(attempts["environment"]?.outcome).toBe("allowed");
      expect(attempts["environment"]?.detail).not.toContain("HALONIC");
      expect(attempts["environment"]?.detail).not.toContain(canary);
    } finally {
      delete process.env["HALONIC_FENCE_TEST_HOST_SECRET"];
    }
  });

  it("A16 and A39: ends no process of this computer with a signal", async () => {
    const victim = spawn(process.execPath, ["-e", "setTimeout(() => {}, 120000)"], {
      stdio: "ignore",
    });
    try {
      const { attempts } = await attack(
        `await attempt("signal", () => process.kill(${victim.pid}, "SIGKILL"));`,
        nodeLayer,
      );
      expect(attempts["signal"]?.outcome).toBe("refused");
      expect(victim.exitCode).toBeNull();
      expect(victim.signalCode).toBeNull();
    } finally {
      victim.kill("SIGKILL");
    }
  });
});

describe("the runner's box on MXC (A23)", () => {
  it("A23: the fence is proven, a closed session ends the program, and nothing starts after", async () => {
    const folders = await attackFolders(base, "a23");
    const beat = join(folders.tempFolder, "heartbeat.txt");
    // Node's layer is off so the script can write its heartbeat in the temp folder.
    const { session, command } = await openAttack({
      sandbox: mxc.sandbox,
      folders,
      script: `
        const fs = await import("node:fs");
        let count = 0;
        setInterval(() => fs.writeFileSync(${JSON.stringify(beat)}, String(count++)), 100);
        await new Promise((resolve) => setTimeout(resolve, 60000));
      `,
      nodeLayer: "off",
      hidden: { homeFolder, socketFolders: [] },
      sandboxFolders: [],
      backend: "mxc",
    });
    try {
      expect(session.fence.state).toBe("fenced");
      const started = await session.start(command);
      await started.stdin.close();
      await waitFor(() => existsSync(beat));
      await session.close();
      expect((await started.exited).code).not.toBe(0);
      // The heartbeat has stopped: nothing the box ran is still writing.
      const stopped = await readFile(beat, "utf8");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(await readFile(beat, "utf8")).toBe(stopped);
      expect(session.fence.state).toBe("stopped");
      await expect(session.start(command)).rejects.toThrow();
    } finally {
      await session.close();
    }
  });
});

/** Waits for a condition for up to ten seconds. */
async function waitFor(condition: () => boolean): Promise<void> {
  for (let tries = 0; tries < 100 && !condition(); tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(condition()).toBe(true);
}
