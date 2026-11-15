import { mkdir, writeFile } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AttackFolders, attackFolders, type NodeLayer, runAttack } from "./attack-session.ts";
import { type RealMxc, realMxc } from "./mxc-sandbox.ts";

// The process and listener cases of the runner's attack list in MXC on Windows 11
// (A14, A15; HAL-9606), split from `runner-attacks.mxc.test.ts` to keep both files
// short. Same box, same profile, and every case runs with Node's layer on and off.

let mxc: RealMxc;
let base: string;
let homeFolder: string;
let homeKey: string;

/** A value that must never come back out of the box. */
const canary = `canary-${Math.random().toString(36).slice(2)}`;
/** The Windows folder, where `cmd.exe` is. Windows always sets it. */
const windowsFolder = process.env["SystemRoot"] ?? "";

beforeAll(async () => {
  mxc = await realMxc();
  base = mxc.base;
  // A home folder of its own, so the test never touches the real one.
  homeFolder = join(base, "home");
  homeKey = join(homeFolder, ".ssh", "id_ed25519");
  await mkdir(join(homeFolder, ".ssh"), { recursive: true });
  await writeFile(homeKey, canary);
});

afterAll(async () => {
  await mxc?.remove();
});

let runs = 0;

/** Runs `script` in a fresh integration folder in the runner's MXC profile. */
async function attack(script: string, nodeLayer: NodeLayer, folders?: AttackFolders) {
  runs += 1;
  return runAttack({
    sandbox: mxc.sandbox,
    folders: folders ?? (await attackFolders(base, `process-${nodeLayer}-${runs}`)),
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

/**
 * Tries to connect to `port` on loopback until `boxRun` settles; true once one connects.
 * It does not stop on a clock: MXC can take any time to start the box, and a probe that
 * gave up first would report "not reached" without ever having tried.
 */
async function connectWhileListening(port: number, boxRun: Promise<unknown>): Promise<boolean> {
  let boxRunSettled = false;
  const markSettled = () => {
    boxRunSettled = true;
  };
  boxRun.then(markSettled, markSettled);
  while (!boxRunSettled) {
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

describe.each(layers)(
  "a process or listener in the runner in MXC, Node's layer %s",
  (nodeLayer) => {
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
        expect(attempts["shell"]).toMatchObject({
          outcome: "refused",
          detail: "ERR_ACCESS_DENIED",
        });
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
  },
);

describe("the box's own loopback on MXC (A15)", () => {
  it("A15: a listener on the box's own loopback, and who can reach it", async () => {
    // The MXC profile has no network rule against a listener on the box's own loopback,
    // so the box can open one (the inspector did). The first run on windows-11-arm showed
    // that a process outside the box cannot connect to it (HAL-9606). Node's layer is off here:
    // with it on, the script can't open a listener at all (`node:net` needs --allow-net).
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
      "off",
    );
    const reached = await connectWhileListening(port, boxRun);
    const { attempts } = await boxRun;
    expect(attempts["listener"]?.outcome).toBe("allowed");
    expect({ listener: attempts["listener"]?.detail, connectedFromOutside: reached }).toEqual({
      listener: "listening, not reached",
      connectedFromOutside: false,
    });
  });
});
