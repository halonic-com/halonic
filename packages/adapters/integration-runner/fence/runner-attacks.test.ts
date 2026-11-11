import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createSocket, type Socket as UdpSocket } from "node:dgram";
import { existsSync, mkdirSync } from "node:fs";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { dirname, join } from "node:path";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { socketFolders } from "../src/halonic/runner-profile.ts";
import {
  type AttackFolders,
  type Attempt,
  attackFolders,
  fenceTestBase,
  type NodeLayer,
  runAttack,
} from "./attack-session.ts";

// The attack cases from the I5 design (HAL-958, section 6) that only the
// fence can stop: escapes from the runner's process, not requests through the
// bridge (those are in `src/halonic/*attacks.test.ts`). Each case runs in the
// runner's own profile in a real srt session, once with Node's layer on as in
// production and once with it off, so the OS fence is tested on its own.
//
// Every case states what is expected with each layer. Where only Node's layer
// stops an attempt, the run without it expects `allowed`, so a change either
// way fails and the gap stays written down.

const sandbox = new SrtSandbox();
const isMac = process.platform === "darwin";

/**
 * Whether an attempt to read a hidden folder found nothing in it. On macOS
 * Seatbelt refuses it. On Linux bubblewrap lays an empty in-memory folder
 * over a hidden one, so the read is allowed and comes back empty.
 */
function foundNothing(attempt: Attempt | undefined): boolean {
  if (attempt?.outcome === "refused") return true;
  return !isMac && attempt?.outcome === "allowed" && attempt.detail === "";
}

/** A value that must never come back out of the fence. */
const canary = `canary-${Math.random().toString(36).slice(2)}`;

let base: string;
let homeFolder: string;
let homeKey: string;
let workspaceEnv: string;
let agentSocket: string;
let agentConnections = 0;
let agent: Server;
let resolver: UdpSocket;
let resolverPort: number;
let resolverQueries = 0;
let victim: ChildProcess;

beforeAll(async () => {
  base = await fenceTestBase("ra-");
  // A home folder of its own, so the test never writes in the real one. The
  // profile hides it the way it hides the real home folder.
  homeFolder = join(base, "home");
  homeKey = join(homeFolder, ".ssh", "id_ed25519");
  workspaceEnv = join(homeFolder, "acme", ".env");
  await mkdir(join(homeFolder, ".ssh"), { recursive: true });
  await mkdir(join(homeFolder, "acme"), { recursive: true });
  await writeFile(homeKey, canary);
  await writeFile(workspaceEnv, `API_KEY=${canary}\n`);

  // A socket on disk in a socket folder, like ssh-agent's (A35).
  await mkdir(join(base, "sockets"));
  agentSocket = join(base, "sockets", "agent.sock");
  agent = createServer((connection) => {
    agentConnections += 1;
    connection.end(canary);
  });
  await new Promise<void>((resolve) => agent.listen(agentSocket, resolve));

  // A DNS server on this computer that only counts what reaches it (A6).
  resolver = createSocket("udp4");
  resolver.on("message", () => {
    resolverQueries += 1;
  });
  await new Promise<void>((resolve) => resolver.bind(0, "127.0.0.1", resolve));
  resolverPort = resolver.address().port;

  // A process outside the fence for the runner to try to signal (A16).
  victim = spawn(process.execPath, ["-e", "setTimeout(() => {}, 120000)"], { stdio: "ignore" });
});

afterAll(async () => {
  victim?.kill("SIGKILL");
  await new Promise<void>((resolve) => (agent ? agent.close(() => resolve()) : resolve()));
  resolver?.close();
  await rm(base, { recursive: true, force: true });
});

let runs = 0;

/** Runs `script` in a fresh integration folder in the runner's profile. */
async function attack(nodeLayer: NodeLayer, script: string, folders?: AttackFolders) {
  runs += 1;
  return runAttack({
    sandbox,
    folders: folders ?? (await attackFolders(base, `${nodeLayer}-${runs}`)),
    script,
    nodeLayer,
    hidden: {
      homeFolder,
      socketFolders: [...socketFolders(process.env), join(base, "sockets")],
    },
  });
}

/** Whether a process is still running, from outside the fence. */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe.each(["on", "off"] as const)("an integration in the fence, Node's layer %s", (layer) => {
  it("A4: reaches no address and resolves no name around the kit", async () => {
    const { attempts } = await attack(
      layer,
      `
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
      `,
    );
    expect(attempts["raw connection"]?.outcome).toBe("refused");
    expect(attempts["global fetch"]?.outcome).toBe("refused");
    expect(attempts["name lookup"]?.outcome).toBe("refused");
  });

  it("A6: sends no DNS query, even to a server it names itself", async () => {
    const queriesBefore = resolverQueries;
    const { attempts } = await attack(
      layer,
      `
      const { Resolver } = await import("node:dns/promises");
      const resolver = new Resolver({ timeout: 1000, tries: 1 });
      resolver.setServers(["127.0.0.1:${resolverPort}"]);
      await attempt("query", async () => JSON.stringify(await resolver.resolve4("probe.example.com")));
      `,
    );
    expect(attempts["query"]?.outcome).toBe("refused");
    expect(resolverQueries).toBe(queriesBefore);
  });

  it("A12: reads nothing in the home folder, also through a link in its own folder", async () => {
    const folders = await attackFolders(base, `${layer}-a12`);
    await symlink(homeKey, join(folders.integrationFolder, "key"));
    const { attempts } = await attack(
      layer,
      `
      const fs = await import("node:fs/promises");
      await attempt("ssh key", () => fs.readFile(${JSON.stringify(homeKey)}, "utf8"));
      await attempt("workspace .env", () => fs.readFile(${JSON.stringify(workspaceEnv)}, "utf8"));
      await attempt("list home", async () => (await fs.readdir(${JSON.stringify(homeFolder)})).join(","));
      await attempt("link to the key", () => fs.readFile(${JSON.stringify(join(folders.integrationFolder, "key"))}, "utf8"));
      `,
      folders,
    );
    for (const name of ["ssh key", "workspace .env", "link to the key"]) {
      expect(attempts[name], name).toMatchObject({ outcome: "refused" });
      expect(attempts[name]?.detail, name).not.toContain(canary);
    }
    expect(foundNothing(attempts["list home"]), JSON.stringify(attempts["list home"])).toBe(true);
  });

  it("A12, known gap: without Node's layer, reads a file outside the home and socket folders", async () => {
    // srt leaves reads open on Linux and macOS and denies only the hidden
    // folders. So once an integration is past Node's layer, a folder outside
    // them, such as `/mnt/c` on WSL2 or a workspace outside the home folder,
    // is readable. This package's own manifest stands in for such a file.
    const outside = join(import.meta.dirname, "..", "package.json");
    const { attempts } = await attack(
      layer,
      `
      const fs = await import("node:fs/promises");
      await attempt("outside file", () => fs.readFile(${JSON.stringify(outside)}, "utf8"));
      `,
    );
    expect(attempts["outside file"]?.outcome).toBe(layer === "on" ? "refused" : "allowed");
  });

  it("A13: writes nothing outside its temp folder, and can't replace its own code", async () => {
    const folders = await attackFolders(base, `${layer}-a13`);
    const { attempts } = await attack(
      layer,
      `
      const fs = await import("node:fs/promises");
      await attempt("own code", () => fs.writeFile(${JSON.stringify(join(folders.integrationFolder, "attack.mjs"))}, "replaced"));
      await attempt("next to its folder", () => fs.writeFile(${JSON.stringify(join(base, "planted.txt"))}, "planted"));
      await attempt("home folder", () => fs.writeFile(${JSON.stringify(join(homeFolder, ".bashrc"))}, "planted"));
      await attempt("temp folder", () => fs.writeFile(${JSON.stringify(join(folders.tempFolder, "scratch.txt"))}, "scratch"));
      `,
      folders,
    );
    expect(attempts["own code"]?.outcome).toBe("refused");
    expect(attempts["next to its folder"]?.outcome).toBe("refused");
    // Without Node's layer on Linux, the write lands in the empty in-memory
    // folder bubblewrap lays over the hidden home folder, which goes with the
    // session. The real home folder stays as it was either way.
    const throwaway = layer === "off" && !isMac;
    expect(attempts["home folder"]?.outcome).toBe(throwaway ? "allowed" : "refused");
    expect(existsSync(join(base, "planted.txt"))).toBe(false);
    expect(existsSync(join(homeFolder, ".bashrc"))).toBe(false);
    // The runner gets no write grant from Node; the fence allows its temp folder.
    expect(attempts["temp folder"]?.outcome).toBe(layer === "on" ? "refused" : "allowed");
  });

  it("A14: starts no process, and one started without Node's layer is still fenced", async () => {
    const { attempts } = await attack(
      layer,
      `
      const { spawnSync } = await import("node:child_process");
      await attempt("shell", () => {
        const run = spawnSync("sh", ["-c", ${JSON.stringify(`echo started; cat ${homeKey}`)}], { encoding: "utf8" });
        if (run.error) throw run.error;
        return run.stdout;
      });
      `,
    );
    if (layer === "on") {
      expect(attempts["shell"]?.outcome).toBe("refused");
    } else {
      expect(attempts["shell"]).toMatchObject({ outcome: "allowed", detail: "started\n" });
    }
  });

  it("A15: starts no worker, add-on, WASI or inspector with Node's layer; without it only Node stops those", async () => {
    const folders = await attackFolders(base, `${layer}-a15`);
    const { attempts } = await attack(
      layer,
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
      folders,
    );
    if (layer === "on") {
      for (const name of ["worker", "wasi", "add-on", "inspector"]) {
        expect(attempts[name], name).toMatchObject({ outcome: "refused" });
      }
    } else {
      // Node's layer is the one that refuses these; the fence still holds
      // what they run (A4, A12, A13). The add-on fails only because the file
      // is no library, which shows the attempt reached the loader.
      expect(attempts["worker"]?.outcome).toBe("allowed");
      expect(attempts["wasi"]?.outcome).toBe("allowed");
      expect(attempts["add-on"]).toMatchObject({ outcome: "refused", detail: "ERR_DLOPEN_FAILED" });
    }
  });

  it("A16: can't signal a process outside the fence", async () => {
    const pid = victim.pid as number;
    const { attempts } = await attack(
      layer,
      `await attempt("signal", () => process.kill(${pid}, "SIGTERM"));`,
    );
    expect(attempts["signal"]?.outcome).toBe("refused");
    expect(isRunning(pid)).toBe(true);
  });

  it("A17: sees only TMPDIR, the safe PATH and the session's marker in its environment", async () => {
    // The profile sets only TMPDIR. The sandbox adds the host's PATH without
    // entries in its own folders, and the random marker it finds the session's
    // processes by. macOS adds its text encoding variable to every process. No
    // proxy, bus, agent or key variable gets in.
    const { attempts } = await attack(
      layer,
      `await attempt("environment", () => Object.keys(process.env).sort().join(","));`,
    );
    const names = [
      "HALONIC_SRT_RUN",
      "PATH",
      "TMPDIR",
      ...(isMac ? ["__CF_USER_TEXT_ENCODING"] : []),
    ];
    expect(attempts["environment"]).toEqual({ outcome: "allowed", detail: names.join(",") });
  });

  it("A35: connects to no socket on disk", async () => {
    const connectionsBefore = agentConnections;
    const dockerSocket = "/var/run/docker.sock";
    const { attempts } = await attack(
      layer,
      `
      const net = await import("node:net");
      const connect = (path) => new Promise((resolve, reject) => {
        const socket = net.connect({ path });
        let got = "";
        socket.on("data", (chunk) => { got += chunk; });
        socket.on("end", () => resolve(got || "connected"));
        socket.on("error", reject);
      });
      await attempt("agent socket", () => connect(${JSON.stringify(agentSocket)}));
      await attempt("docker socket", () => connect(${JSON.stringify(dockerSocket)}));
      `,
    );
    expect(attempts["agent socket"]?.outcome).toBe("refused");
    expect(attempts["agent socket"]?.detail).not.toContain(canary);
    expect(agentConnections).toBe(connectionsBefore);
    // Missing where Docker isn't installed; refused either way.
    expect(attempts["docker socket"]?.outcome).toBe("refused");
  });
});

// A36 on macOS: the system's `security` tool asks securityd over Mach for a
// keychain item, so the file fence alone doesn't cover it. The design says:
// if this gets through, `sandbox-srt` must deny those Mach services before I5
// ships. On Linux the Secret Service is a D-Bus socket in a socket folder,
// covered by A35 and by the environment holding no bus address (A17).
describe.skipIf(!isMac)("an integration in the fence on macOS, Node's layer off", () => {
  const service = "halonic-fence-attack";
  let keychain: string;

  beforeAll(() => {
    // In the hidden home folder, where the login keychain is.
    keychain = join(homeFolder, "Library", "Keychains", "attack.keychain-db");
    mkdirSync(dirname(keychain), { recursive: true });
    const password = Math.random().toString(36).slice(2);
    execFileSync("security", ["create-keychain", "-p", password, keychain]);
    execFileSync("security", [
      "add-generic-password",
      "-s",
      service,
      "-a",
      "halonic-ci",
      "-w",
      canary,
      keychain,
    ]);
  });

  afterAll(() => {
    if (keychain) execFileSync("security", ["delete-keychain", keychain]);
  });

  it("A36: gets no keychain item through securityd", async () => {
    const { attempts } = await attack(
      "off",
      `
      const { spawnSync } = await import("node:child_process");
      await attempt("keychain item", () => {
        const run = spawnSync("/usr/bin/security", ["find-generic-password", "-w", "-s", "${service}", ${JSON.stringify(keychain)}], { encoding: "utf8" });
        if (run.error) throw run.error;
        if (run.status !== 0) throw Object.assign(new Error(run.stderr), { code: "EXIT_" + run.status });
        return run.stdout;
      });
      `,
    );
    expect(attempts["keychain item"]?.outcome).toBe("refused");
    expect(attempts["keychain item"]?.detail).not.toContain(canary);
  });
});
