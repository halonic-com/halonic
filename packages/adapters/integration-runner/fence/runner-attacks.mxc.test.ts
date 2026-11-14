import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createSocket, type Socket as UdpSocket } from "node:dgram";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { connect, createServer, type Server } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type AttackFolders,
  attackFolders,
  type NodeLayer,
  openAttack,
  runAttack,
} from "./attack-session.ts";
import { credentialReadScript } from "./credential-probe.ts";
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
// and Node's layer. `mxcFencesRunner` was off until every case here had
// passed, A6 and A23 included. A36 past Node's layer (HAL-9362): the box shows
// the vault's entry names but refuses the secret read.

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
const powershell = join(windowsFolder, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

beforeAll(async () => {
  mxc = await realMxc();
  // Under the user's profile, as the integration folders are in production, not in `%TEMP%`.
  base = mxc.base;
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

/** A port on this computer's loopback that nothing is using right now. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

/** Tries to connect to `port` on loopback until `ms` pass; true once one connects. */
async function connectWhileListening(port: number, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: "127.0.0.1", port });
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
    if (connected) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
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

  it("A6: a name lookup through Windows' DNS client sends no query from the box", async () => {
    // A lookup by name (`dns.lookup`, so also `fetch` and `net.connect`) goes
    // to the Windows DNS client service on this computer, outside the box.
    // Proof of what reaches it: an NRPT rule sends every name under a made-up
    // namespace to a DNS server of this test on 127.0.0.1:53, which counts
    // what it receives. The box refuses a direct send to that server (the
    // case above), so a query arriving there would have come from the DNS
    // client, outside the box. A hosts-file name would prove nothing: if the
    // box fenced the client, Windows would read the hosts file inside the box.
    // Needs admin rights and a free port 53, which a CI runner has.
    // On windows-11-arm no query arrives: the lookup from the box fails within
    // milliseconds (`ERR_ACCESS_DENIED` with Node's layer on, `ENOTFOUND` with
    // it off). The test cannot tell whether the box fences
    // the client or the client refuses a box without a network capability, so
    // a profile that grants that capability needs this test re-checked.
    // With Node's layer on, Node refuses the lookup before the box is
    // involved, so only the layer-off run tests the box.
    const suffix = Math.random().toString(36).slice(2);
    const namespace = `halonic-gap-${suffix}.test`;
    const label = `leak-${canary}`;
    const received: string[] = [];
    const server = createSocket("udp4");
    server.on("message", (query, remote) => {
      received.push(query.toString("latin1"));
      // Answer "no such name", so the lookup ends at once.
      const answer = Buffer.from(query);
      answer[2] = 0x81;
      answer[3] = 0x83;
      server.send(answer, remote.port, remote.address);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.bind(53, "127.0.0.1", resolve);
    });
    const nrpt = (command: string) =>
      execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", command]);
    const flush = () =>
      execFileSync(join(windowsFolder, "System32", "ipconfig.exe"), ["/flushdns"]);
    try {
      nrpt(`Add-DnsClientNrptRule -Namespace '.${namespace}' -NameServers '127.0.0.1'`);
      flush();
      // Control: the same lookup outside the box must reach the server.
      // Without it, a silent server would not say whether the box or the
      // setup is the reason.
      const controlLabel = `control-${suffix}`;
      await lookup(`${controlLabel}.${namespace}`).catch(() => undefined);
      expect(
        received.some((query) => query.includes(controlLabel)),
        "the control lookup outside the box reached the server (setup)",
      ).toBe(true);
      // The control must come first: a server that heard nothing from the box
      // counts as "fenced" only when it can hear at all.
      const { attempts } = await attack(
        `
        const dns = await import("node:dns/promises");
        let milliseconds = 0;
        await attempt("lookup", async () => {
          const started = Date.now();
          try {
            return (await dns.lookup(${JSON.stringify(`${label}.${namespace}`)})).address;
          } finally {
            milliseconds = Date.now() - started;
          }
        });
        await attempt("milliseconds", async () => String(milliseconds));
      `,
        nodeLayer,
      );
      const inBox = attempts["lookup"];
      console.log(
        `A6 in-box lookup, Node's layer ${nodeLayer}: ${inBox?.outcome} (${inBox?.detail}) after ${attempts["milliseconds"]?.detail} ms`,
      );
      // Why it fails, so a change in the reason shows up too. With Node's layer
      // on, Node itself refuses the lookup. With it off, the lookup comes back
      // "not found" within a few milliseconds: no timeout, and no query out.
      expect(inBox?.outcome, "the lookup from the box failed at once").toBe("refused");
      expect(inBox?.detail, "the lookup's error").toBe(
        nodeLayer === "on" ? "ERR_ACCESS_DENIED" : "ENOTFOUND",
      );
      expect(Number(attempts["milliseconds"]?.detail), "the lookup did not wait").toBeLessThan(
        5000,
      );
      expect(
        received.some((query) => query.includes(label)),
        "no query from the box reached the server",
      ).toBe(false);
    } finally {
      try {
        nrpt(
          `Get-DnsClientNrptRule | Where-Object { $_.Namespace -contains '.${namespace}' } | Remove-DnsClientNrptRule -Force`,
        );
      } finally {
        flush();
        server.close();
      }
    }
  });

  it("A12: reads nothing in the home folder or outside the integration's folder", async () => {
    const outside = join(import.meta.dirname, "..", "package.json");
    // Links inside the folder it may read, pointing at what it may not: a
    // junction to the home folder and, where this computer lets a test make
    // one, a symbolic link to the key file itself.
    const folders = await attackFolders(base, `a12-${nodeLayer}`);
    const junction = join(folders.integrationFolder, "home-junction");
    await symlink(homeFolder, junction, "junction");
    const fileLink = join(folders.integrationFolder, "key-link");
    const hasFileLink = await symlink(homeKey, fileLink, "file").then(
      () => true,
      () => false, // Windows only lets a test make one with Developer Mode or as an administrator.
    );
    const { attempts } = await attack(
      `
      const fs = await import("node:fs/promises");
      await attempt("ssh key", () => fs.readFile(${JSON.stringify(homeKey)}, "utf8"));
      await attempt("workspace .env", () => fs.readFile(${JSON.stringify(workspaceEnv)}, "utf8"));
      await attempt("list home", async () => (await fs.readdir(${JSON.stringify(homeFolder)})).join(","));
      await attempt("outside file", () => fs.readFile(${JSON.stringify(outside)}, "utf8"));
      await attempt("key through a junction", () => fs.readFile(${JSON.stringify(join(junction, ".ssh", "id_ed25519"))}, "utf8"));
      await attempt("list home through a junction", async () => (await fs.readdir(${JSON.stringify(junction)})).join(","));
      await attempt("key through a file link", () => fs.readFile(${JSON.stringify(fileLink)}, "utf8"));
    `,
      nodeLayer,
      folders,
    );
    const names = [
      "ssh key",
      "workspace .env",
      "list home",
      "outside file",
      "key through a junction",
      "list home through a junction",
      ...(hasFileLink ? ["key through a file link"] : []),
    ];
    for (const name of names) {
      expect(attempts[name]?.outcome, name).toBe("refused");
      expect(attempts[name]?.detail, name).not.toContain(canary);
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

  it("A36: reaches the Credential Manager once past Node's layer (known gap)", async () => {
    // With Node's layer on, the runner can't start the program that asks for
    // the credential. Without it, the box doesn't hide the host user's
    // vault: the entry is there to read (decision on HAL-9362).
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
    if (nodeLayer === "on") {
      expect(attempts["credential"]).toMatchObject({
        outcome: "refused",
        detail: "ERR_ACCESS_DENIED",
      });
    } else {
      expect(attempts["credential"]).toEqual({ outcome: "allowed", detail: "listed" });
    }
  });

  it("A36: cannot read a Credential Manager secret even past Node's layer", async () => {
    // `cmdkey /list` above only shows the vault is not hidden. This asks for
    // the secret itself, through the same call a program uses (`CredRead`),
    // and checks that no value comes out. With Node's layer off the box
    // itself refuses: `CredRead` fails (the probe exits 1) although the same
    // probe reads the secret on this computer, shown by the control below.
    // The control: the same probe on this computer, outside the box, must read
    // the secret. Otherwise a failure in the box says nothing about the box.
    const control = spawnSync(
      powershell,
      ["-NoProfile", "-NonInteractive", "-Command", credentialReadScript(credentialTarget)],
      {
        encoding: "utf8",
        timeout: 20000,
      },
    );
    expect(control.stdout, control.stderr).toBe(canary);

    const { attempts, stderr } = await attack(
      `
      const { spawnSync } = await import("node:child_process");
      await attempt("secret", () => {
        const run = spawnSync(${JSON.stringify(powershell)}, ["-NoProfile", "-NonInteractive", "-Command", ${JSON.stringify(credentialReadScript(credentialTarget))}], {
          encoding: "utf8",
          // No input to wait for, and an end well inside the attack's own, so a
          // stuck PowerShell is reported here with what it printed.
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 20000,
        });
        // An attempt keeps only the error's code, so what the probe printed goes
        // to this script's stderr, where the test reads it on a failure.
        process.stderr.write("probe stdout: " + run.stdout.length + " bytes; probe stderr: " + run.stderr + "\\n");
        if (run.error) throw run.error;
        if (run.status !== 0) throw Object.assign(new Error("exit " + run.status), { code: "EXIT_" + run.status });
        // Report whether the secret came out, never the secret itself.
        return run.stdout === ${JSON.stringify(canary)} ? "read" : "other output";
      });
    `,
      nodeLayer,
    );
    expect(attempts["secret"]?.outcome, stderr).toBe("refused");
    if (nodeLayer === "off") {
      expect(attempts["secret"]?.detail, stderr).toBe("EXIT_1");
    }
  });

  it("A14: starts no process outside what the box allows", async () => {
    // With Node's layer on, no process at all. With it off, a program starts
    // inside the box, and the box's own limits hold for it: the program the
    // script starts cannot read the home folder either (A12).
    const cmd = join(windowsFolder, "System32", "cmd.exe");
    const { attempts } = await attack(
      `
      const { spawnSync } = await import("node:child_process");
      await attempt("shell", () => {
        const run = spawnSync(${JSON.stringify(cmd)}, ["/d", "/c", "echo started"], { encoding: "utf8" });
        if (run.error) throw run.error;
        return run.stdout;
      });
      await attempt("shell reads the ssh key", () => {
        const run = spawnSync(${JSON.stringify(cmd)}, ["/d", "/c", "type", ${JSON.stringify(homeKey)}], { encoding: "utf8" });
        if (run.error) throw run.error;
        if (run.status !== 0) throw Object.assign(new Error(run.stderr), { code: "EXIT_" + run.status });
        return run.stdout;
      });
    `,
      nodeLayer,
    );
    if (nodeLayer === "on") {
      expect(attempts["shell"]).toMatchObject({ outcome: "refused", detail: "ERR_ACCESS_DENIED" });
      expect(attempts["shell reads the ssh key"]).toMatchObject({
        outcome: "refused",
        detail: "ERR_ACCESS_DENIED",
      });
    } else {
      // The shell ran, and what the box lets it do is what it lets the script do.
      expect(attempts["shell"]?.outcome).toBe("allowed");
      expect(attempts["shell"]?.detail).toContain("started");
      // It ran and exited with an error; it was not stopped from starting.
      expect(attempts["shell reads the ssh key"]?.outcome).toBe("refused");
      expect(attempts["shell reads the ssh key"]?.detail).toMatch(/^EXIT_[1-9]/);
      expect(attempts["shell reads the ssh key"]?.detail).not.toContain(canary);
    }
  });

  it("A15: starts no add-on or inspector, and with Node's layer on no worker or WASI either", async () => {
    const folders = await attackFolders(base, `a15-${nodeLayer}`);
    // A real DLL, from the Windows folder the box can read. It is not a Node
    // add-on, so with Node's layer off Windows loads it and Node then says it
    // registered no module; a missing or unreadable file would say something else.
    const dll = join(windowsFolder, "System32", "kernel32.dll");
    const { attempts } = await attack(
      `
      const { Worker } = await import("node:worker_threads");
      await attempt("worker", () => new Promise((resolve, reject) => {
        const worker = new Worker("process.exit(0)", { eval: true });
        worker.on("error", reject);
        worker.on("exit", () => resolve("ran"));
      }));
      await attempt("wasi", async () => { const { WASI } = await import("node:wasi"); new WASI({ version: "preview1" }); return "created"; });
      await attempt("add-on", () => {
        try {
          process.dlopen({ exports: {} }, ${JSON.stringify(dll)});
        } catch (error) {
          throw Object.assign(error, { code: error.code + ": " + error.message });
        }
        return "loaded";
      });
      await attempt("inspector", async () => {
        const inspector = await import("node:inspector");
        inspector.open(0, "127.0.0.1");
        const url = inspector.url();
        inspector.close();
        if (url === undefined) throw Object.assign(new Error("no inspector"), { code: "NO_INSPECTOR" });
        return url;
      });
      `,
      nodeLayer,
      folders,
    );
    if (nodeLayer === "on") {
      for (const name of ["worker", "wasi", "add-on", "inspector"]) {
        expect(attempts[name], name).toMatchObject({ outcome: "refused" });
      }
      // Node's layer does not pass --allow-addons, so it refuses before the DLL is opened.
      expect(attempts["add-on"]?.detail).toContain("ERR_DLOPEN_DISABLED");
    } else {
      // The box has no Node rule against these, and a worker is only a thread.
      expect(attempts["worker"]?.outcome).toBe("allowed");
      // Creating a WASI object grants nothing: it reaches only the folders a module is given.
      expect(attempts["wasi"]?.outcome).toBe("allowed");
      // Windows loads the DLL; Node refuses it because it is no add-on.
      expect(attempts["add-on"]?.outcome).toBe("refused");
      expect(attempts["add-on"]?.detail).toContain("did not self-register");
      // MXC has no rule against a listener on the box's own loopback (see attack-cases.md).
      expect(attempts["inspector"]?.outcome).toBe("allowed");
      expect(attempts["inspector"]?.detail).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\//);
    }
  });

  it.runIf(nodeLayer === "off")(
    "A15: a listener on the box's own loopback, and who can reach it",
    async () => {
      // The MXC profile has no network rule against a listener on the box's own loopback,
      // so the box can open one (the inspector did). The first run on windows-11-arm showed
      // that a process outside the box cannot connect to it (HAL-9606).
      const port = await freePort();
      const boxRun = attack(
        `
      const net = await import("node:net");
      await attempt("listener", () => new Promise((resolve, reject) => {
        const server = net.createServer((connection) => { connection.end(); server.close(); resolve("reached from outside"); });
        server.on("error", reject);
        server.listen(${port}, "127.0.0.1", () => setTimeout(() => { server.close(); resolve("listening, not reached"); }, 8000));
      }));
      `,
        nodeLayer,
      );
      const reached = await connectWhileListening(port, 7000);
      const { attempts } = await boxRun;
      expect(attempts["listener"]?.outcome).toBe("allowed");
      expect({ listener: attempts["listener"]?.detail, connectedFromOutside: reached }).toEqual({
        listener: "listening, not reached",
        connectedFromOutside: false,
      });
    },
  );

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
