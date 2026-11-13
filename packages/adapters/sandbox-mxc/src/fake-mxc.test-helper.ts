import { connect } from "node:net";
import { PassThrough } from "node:stream";
import { BoxFolders } from "./box-folders.ts";
import type { MxcMachine } from "./machine.ts";
import type { MemoryDisk } from "./memory-disk.test-helper.ts";
import type { MxcProcess, MxcRequest, MxcSpawnOptions } from "./mxc-process.ts";

// Made-up Windows paths, each marked for the leak guard on its own line.
/** Halonic's data folder in the tests. */
export const dataFolder = "C:\\acme\\data"; // leak-guard: allow absolute-path made-up Windows path for a test
/** The Node program the fence proof runs as in the tests. */
export const nodeProgram = "C:\\acme\\node\\node.exe"; // leak-guard: allow absolute-path made-up Windows path for a test
/** The Node program's folder. */
export const nodeFolder = "C:\\acme\\node"; // leak-guard: allow absolute-path made-up Windows path for a test

/** Box folders on a memory disk: `box-1`, `box-2`, and so on, under the data folder. */
export function testBoxes(disk: MemoryDisk): { boxes: BoxFolders; made: () => string[] } {
  const made: string[] = [];
  const boxes = new BoxFolders(dataFolder, 4242, {
    makeFolder: async (path) => {
      disk.folder(path);
    },
    makeFreshFolder: async (prefix) => {
      const path = `${prefix}${made.length + 1}`;
      made.push(path);
      disk.folder(path);
      return path;
    },
    names: async () => [],
    remove: (path) => disk.remove(path),
    isRunning: () => false,
  });
  return { boxes, made: () => made };
}

/** What a fake program prints and how it ends. */
export interface FakeResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  /** Runs until it is killed. */
  hang?: boolean;
}

/** A request, with the settings the probe program would have read. */
export interface FakeCall {
  request: MxcRequest;
  /** The probe program's settings, or `null` when the request isn't for a probe. */
  settings: ProbeSettings | null;
  /** The probe program's file: `probe.cjs` for the leak probe, the canary's own file for the work probe. */
  script: string | null;
}

/** The settings file the leak probe reads. */
export interface ProbeSettings {
  control: string;
  hidden: string;
  denied: string;
  ports?: { host: string; port: number }[];
  lan?: { host: string; port: number }[];
  internet?: { host: string; port: number }[];
  dns?: { host: string; port: number }[];
  bridge?: { host: string; port: number } | null;
  writes?: { create: string; existing: string }[];
  folder?: string;
  name?: string;
}

/** Decides what each started program does. */
export type Behavior = (call: FakeCall) => FakeResult | Promise<FakeResult>;

/** A program that does nothing and exits at once. */
export const quietProgram: FakeResult = { exitCode: 0 };

/**
 * A fake MXC SDK: records every request and its options, and runs each
 * program as `behavior` says. No real process starts.
 */
export class FakeMxc {
  readonly requests: MxcRequest[] = [];
  readonly options: MxcSpawnOptions[] = [];
  disposed = 0;
  killed = 0;
  readonly #disk: MemoryDisk;
  #behavior: Behavior;

  constructor(disk: MemoryDisk, behavior: Behavior) {
    this.#disk = disk;
    this.#behavior = behavior;
  }

  /** Changes what programs do from now on. */
  behave(behavior: Behavior): void {
    this.#behavior = behavior;
  }

  /** The requests that weren't for a probe program. */
  programs(): MxcRequest[] {
    return this.requests.filter((request) => !isProbe(request));
  }

  /** The requests that were for a probe program. */
  probes(): MxcRequest[] {
    return this.requests.filter(isProbe);
  }

  /** A machine on Windows 11 Pro that offers MXC and starts programs through this fake. */
  machine(): MxcMachine {
    return {
      platform: "win32",
      windowsRelease: () => ({ build: 26200, productName: "Windows 10 Pro" }),
      mxcSupport: async () => ({ loaded: true, tier: "base-container", loopbackProxy: true }),
      spawn: async (request, options) => this.#spawn(request, options),
    };
  }

  async #spawn(request: MxcRequest, options: MxcSpawnOptions): Promise<MxcProcess> {
    this.requests.push(request);
    this.options.push(options);
    const call = await this.#callOf(request);
    const result = await this.#behavior(call);
    return this.#process(result);
  }

  async #callOf(request: MxcRequest): Promise<FakeCall> {
    const [config, script] = request.command.split(" ").reverse();
    const text =
      config === undefined || !isProbe(request) ? null : await this.#disk.readText(config);
    return {
      request,
      settings: text === null ? null : (JSON.parse(text) as ProbeSettings),
      script: script ?? null,
    };
  }

  #process(result: FakeResult): MxcProcess {
    const standardOutput = new PassThrough();
    const standardError = new PassThrough();
    let finish: (exitCode: number) => void = () => undefined;
    const ended = new Promise<number>((resolve) => {
      finish = resolve;
    });
    standardOutput.end(result.stdout ?? "");
    standardError.end(result.stderr ?? "");
    if (result.hang !== true) finish(result.exitCode ?? 0);
    let disposed = false;
    return {
      standardInput: new PassThrough(),
      standardOutput,
      standardError,
      wait: async () => ({ exitCode: await ended, timedOut: false }),
      kill: () => {
        // The real SDK may refuse a process it has freed.
        if (disposed) throw new Error("the process is disposed");
        this.killed += 1;
        finish(1);
      },
      dispose: () => {
        disposed = true;
        this.disposed += 1;
      },
    };
  }
}

/** Whether the request starts one of the adapter's probe programs. */
export function isProbe(request: MxcRequest): boolean {
  return /\.cjs\b/.test(request.command);
}

/** What can go wrong in a fake box, one thing at a time, as the real probe would find it. */
export interface Leaks {
  hidden?: boolean;
  denied?: boolean;
  /** The allowed folder's control file can't be read. */
  controlUnreadable?: boolean;
  reachPort?: boolean;
  /** The probe connects to the router's usual address or another address of the local network. */
  reachLan?: boolean;
  /** The probe connects to an address on the internet. */
  reachInternet?: boolean;
  /** A public DNS server answers the probe's query. */
  reachDns?: boolean;
  /** Every network attempt fails with this code, the bridge too: Winsock failing to start, say. */
  networkFailsWith?: string;
  /** Attempts that are blocked time out, rather than being refused. */
  blockedAttemptsTimeOut?: boolean;
  /** The probe can't reach the bridge, the network control. */
  bridgeUnreachable?: boolean;
  writeOutside?: boolean;
  /** Node can't list or write the working folder. */
  workFolderBroken?: boolean;
}

/**
 * A box as it should be: the control file reads, the hidden and denied files
 * don't, no port is reached, and the canary's work folder lists and writes.
 */
export function healthyBox(disk: MemoryDisk, leaks: Leaks = {}): Behavior {
  return async ({ settings, script }) => {
    if (settings === null) return quietProgram;
    if (settings.folder !== undefined) return workReport(leaks);
    if (script?.endsWith("probe.cjs") !== true) return quietProgram;
    await actOutside(disk, settings, leaks);
    return leakReport(settings, leaks);
  };
}

function workReport(leaks: Leaks): FakeResult {
  const works = leaks.workFolderBroken !== true;
  return {
    stdout: `${JSON.stringify({ listed: works, wrote: works })}\n`,
    exitCode: works ? 0 : 1,
  };
}

/** What a leaking box does besides reading: connects to the ports and writes where it may not. */
async function actOutside(disk: MemoryDisk, settings: ProbeSettings, leaks: Leaks): Promise<void> {
  if (leaks.reachPort === true) {
    for (const { host, port } of settings.ports ?? []) await reach(host, port);
  }
  if (leaks.writeOutside === true) {
    for (const { create } of settings.writes ?? [])
      await disk.writeText(create, "written by the box");
  }
}

function leakReport(settings: ProbeSettings, leaks: Leaks): FakeResult {
  const attempt = (reached: boolean) => (target: { host: string; port: number }) => {
    const broken = leaks.networkFailsWith;
    if (reached) return { ...target, state: "connected", code: null };
    if (broken !== undefined) return { ...target, state: "failed", code: broken };
    if (leaks.blockedAttemptsTimeOut === true) return { ...target, state: "timeout", code: null };
    return { ...target, state: "refused", code: "ECONNREFUSED" };
  };
  const bridge = settings.bridge ?? null;
  const report = {
    control: leaks.controlUnreadable === true ? "hidden" : "readable",
    hidden: leaks.hidden === true ? "readable" : "hidden",
    denied: leaks.denied === true ? "readable" : "hidden",
    ports: (settings.ports ?? []).map(attempt(leaks.reachPort === true)),
    lan: (settings.lan ?? []).map(attempt(leaks.reachLan === true)),
    internet: (settings.internet ?? []).map(attempt(leaks.reachInternet === true)),
    dns: (settings.dns ?? []).map(attempt(leaks.reachDns === true)),
    network:
      bridge === null
        ? null
        : attempt(leaks.networkFailsWith === undefined && leaks.bridgeUnreachable !== true)(bridge),
  };
  return { stdout: `${JSON.stringify(report)}\n`, exitCode: 0 };
}

/** Connects to a port of this computer, as a leaking box would. */
function reach(host: string, port: number): Promise<void> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("error", () => resolve());
  });
}
