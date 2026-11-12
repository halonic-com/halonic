// The trust-check canary for MXC (docs/adr/2026-11-10-mxc-sandbox-backend.md,
// "The trust check"). `core/app` runs it: it opens a session with the profile
// built here, hands the open session to `probe`, and decides the failure code
// from what `probe` found. The adapter builds both, because only it knows its
// policy.

import { randomBytes } from "node:crypto";
import { win32 } from "node:path";
import type { CanaryFindings, TrustCanary, TrustCheckLeak } from "@halonicjs/app";
import type {
  SandboxCommand,
  SandboxProcess,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import type { BoxFolder, BoxFolders } from "./box-folders.ts";
import { fileDisk, type MxcDisk } from "./disk.ts";
import {
  controlText,
  type FenceFiles,
  fenceFiles,
  victimText,
  writeFenceFiles,
} from "./fence-files.ts";
import { type LoopbackListener, listenOnLoopback } from "./loopback-listener.ts";
import { MxcSession } from "./mxc-session.ts";
import {
  type LeakReport,
  parseLeakReport,
  parseWorkReport,
  workProbeScript,
} from "./probe-scripts.ts";
import { errorLine, runToEnd } from "./run-to-end.ts";

/** What the canary is built from. */
export interface MxcCanaryOptions {
  /** The project folder: the canary's working folder, as in a real run. */
  projectFolder: string;
  /** The port of the bridge the canary session reaches, as in a real run. */
  bridgePort: number;
  /** Makes the canary's own box folder, under Halonic's data folder. */
  boxes: BoxFolders;
  /** The disk; the real one by default. */
  disk?: MxcDisk;
  /** The Node program the probes run as; the one running Halonic by default. */
  nodeProgram?: string;
  /** The check's time limit, for the canary session, in milliseconds. 60 seconds by default. */
  timeLimitMs?: number;
  /** How long each probe program may take, in milliseconds. 15 seconds by default. */
  programTimeoutMs?: number;
}

/** A canary box: its folder, and where the probe's files are in it. */
interface CanaryBox {
  folder: BoxFolder;
  files: FenceFiles;
}

/**
 * The canary of MXC's trust check. {@link profile} builds its box exactly
 * like a real session's: the project folder as the working folder, a fresh box
 * folder under Halonic's data folder (never `%TEMP%`) for the temp, settings
 * and read-only folders, the bridge as the network. {@link probe} runs the
 * probe programs in the open session and adds the third control: Node loads a
 * script from the working folder, lists it and writes in it.
 *
 * The canary's box folder is removed when `probe` ends, by the next
 * {@link profile} and by {@link release}; call `release` when the session
 * could not be opened.
 *
 * @example
 * const canary = new MxcCanary({ projectFolder, bridgePort, boxes });
 * const result = await runTrustCheck(mxc, canary);
 */
export class MxcCanary implements TrustCanary {
  readonly #options: MxcCanaryOptions;
  readonly #disk: MxcDisk;
  readonly #nodeProgram: string;
  readonly #programTimeoutMs: number;
  #box: CanaryBox | null = null;

  constructor(options: MxcCanaryOptions) {
    this.#options = options;
    this.#disk = options.disk ?? fileDisk;
    this.#nodeProgram = options.nodeProgram ?? process.execPath;
    this.#programTimeoutMs = options.programTimeoutMs ?? 15_000;
  }

  async profile(): Promise<SandboxProfile> {
    await this.release();
    const folder = await this.#options.boxes.create();
    const files = fenceFiles(folder.path);
    this.#box = { folder, files };
    await writeFenceFiles(this.#disk, files);
    await this.#disk.makeFolder(files.temp);
    await this.#disk.makeFolder(files.settings);
    return {
      workingFolder: this.#options.projectFolder,
      tempFolder: files.temp,
      settingsFolder: files.settings,
      readOnlyPaths: [files.readable, win32.dirname(this.#nodeProgram)],
      deniedPaths: [files.denied],
      env: {},
      network: {
        bridge: { kind: "loopback", host: "127.0.0.1", port: this.#options.bridgePort },
        allowedSites: [],
      },
      timeLimitMs: this.#options.timeLimitMs ?? 60_000,
    };
  }

  async probe(session: SandboxSession): Promise<CanaryFindings> {
    const box = this.#box;
    if (box === null) throw new Error("the canary's profile() has to be built before its probe()");
    try {
      const leaks = await this.#probeLeaks(session, box.files);
      if (leaks.report === null) return { started: false, missing: leaks.missing };
      const missing = [...leaks.missing];
      const work = await this.#probeWork(session, box.files);
      if (!work) {
        missing.push(
          "Node couldn't load a script from the working folder, list the folder and write in it.",
        );
      }
      return {
        started: true,
        leaks: leaks.found,
        controls: {
          readOnlyFileRead: leaks.report.control === "readable",
          workFolderScriptLoaded: work,
        },
        // A known limit of MXC: lookups go through the Windows DNS client service outside the box.
        nameLookupsLeave: true,
        missing,
      };
    } finally {
      await this.release();
    }
  }

  /** Removes the canary's box folder. Does nothing when there is none. */
  async release(): Promise<void> {
    const box = this.#box;
    this.#box = null;
    await box?.folder.remove();
  }

  /** The leak probes: files, the loopback ports and files written where nothing may be. */
  async #probeLeaks(
    session: SandboxSession,
    files: FenceFiles,
  ): Promise<{ report: LeakReport | null; found: TrustCheckLeak[]; missing: string[] }> {
    const listeners = await listenOnLoopbacks();
    try {
      const ports = listeners.map(({ host, port }) => ({ host, port }));
      const settings = {
        control: files.control,
        hidden: files.canary,
        denied: files.denied,
        ports,
        writes: writesOf(files),
      };
      await this.#disk.writeText(files.config, JSON.stringify(settings));
      const finished = await runToEnd(
        await startProbe(session, {
          program: this.#nodeProgram,
          args: [files.script, files.config],
        }),
        this.#programTimeoutMs,
      );
      const report = parseLeakReport(finished.stdout);
      if (report === null) {
        const detail = errorLine(finished.stderr);
        const exit = finished.exit.code ?? finished.exit.signal;
        return {
          report,
          found: [],
          missing: [
            `The canary probe did not report (exit ${exit})${detail === "" ? "" : `: ${detail}`}.`,
          ],
        };
      }
      const written = await this.#writtenWhereRefused(files);
      return { report, ...judge(report, listeners, written) };
    } finally {
      for (const listener of listeners) listener.close();
    }
  }

  /** Whether the box created, changed or removed a file in a folder it may only read, or one it may not see. */
  async #writtenWhereRefused(files: FenceFiles): Promise<boolean> {
    for (const { create } of writesOf(files)) {
      if ((await this.#disk.readText(create)) !== null) return true;
    }
    return (
      (await this.#disk.readText(files.victim)) !== victimText ||
      (await this.#disk.readText(files.control)) !== controlText
    );
  }

  /** The third control: Node loads a script from the working folder, lists the folder and writes in it. */
  async #probeWork(session: SandboxSession, files: FenceFiles): Promise<boolean> {
    const name = `.halonic-canary-${randomBytes(4).toString("hex")}`;
    const script = win32.join(this.#options.projectFolder, `${name}.cjs`);
    const config = win32.join(files.readable, "work.json");
    try {
      await this.#disk.writeText(script, workProbeScript);
      await this.#disk.writeText(
        config,
        JSON.stringify({ folder: this.#options.projectFolder, name: `${name}.tmp` }),
      );
      const finished = await runToEnd(
        await startProbe(session, { program: this.#nodeProgram, args: [script, config] }),
        this.#programTimeoutMs,
      );
      const report = parseWorkReport(finished.stdout);
      return report?.listed === true && report.wrote;
    } finally {
      await this.#disk.remove(script);
    }
  }
}

/**
 * The writes the leak probe tries: a new file and a change to an existing one
 * in the hidden folder, which no grant names, and in the readable folder,
 * which is read-only.
 */
function writesOf(files: FenceFiles): { create: string; existing: string }[] {
  return [
    { create: win32.join(files.hidden, "created.txt"), existing: files.victim },
    { create: win32.join(files.readable, "created.txt"), existing: files.control },
  ];
}

/** Listeners the box must not reach: on `127.0.0.1`, and on `::1` where this computer has it. */
async function listenOnLoopbacks(): Promise<LoopbackListener[]> {
  const v4 = await listenOnLoopback("127.0.0.1");
  if (v4 === null) throw new Error("this computer can't listen on 127.0.0.1");
  const v6 = await listenOnLoopback("::1");
  return v6 === null ? [v4] : [v4, v6];
}

/** What leaked, and a sentence for each. */
function judge(
  report: LeakReport,
  listeners: readonly LoopbackListener[],
  writtenWhereRefused: boolean,
): { found: TrustCheckLeak[]; missing: string[] } {
  const found: TrustCheckLeak[] = [];
  const missing: string[] = [];
  if (report.hidden !== "hidden" || report.denied !== "hidden") {
    found.push("file-readable");
    missing.push("The canary read a hidden file, or a denied file inside a folder it may read.");
  }
  if (writtenWhereRefused) {
    found.push("file-writable");
    missing.push("The canary created, changed or removed a file outside the writable folders.");
  }
  const reached = listeners.some((listener) => listener.reached());
  const answered =
    report.ports.length !== listeners.length ||
    report.ports.some((port) => port.state !== "blocked");
  if (reached || answered) {
    found.push("port-reachable");
    missing.push("The canary reached a loopback port of this computer other than the bridge.");
  }
  if (report.control !== "readable") {
    missing.push("The canary couldn't read a file in a folder it may read.");
  }
  return { found, missing };
}

/** Starts a probe program: the adapter's own session runs it even when its fence isn't proven, so the canary can say what leaked. */
async function startProbe(
  session: SandboxSession,
  command: SandboxCommand,
): Promise<SandboxProcess> {
  return session instanceof MxcSession ? session.startProbe(command) : session.start(command);
}
