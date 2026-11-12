import { connect } from "node:net";
import { basename, join } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { probeFilePrefix } from "./fence-proof.ts";
import type { Runner, RunningProgram, RunRequest } from "./srt-runner.ts";

export const linux = {
  platform: "linux" as const,
  insideContainer: async () => false,
  hasBubblewrap: async () => true,
  hasLinuxHelpers: async () => true,
  userNamespacesRestricted: async () => false,
  hasSeatbelt: async () => true,
  hasWindowsSandbox: async () => false,
  installWindowsSandbox: async () => "installed" as const,
  letSandboxReadParents: async () => undefined,
  uninstallWindowsSandbox: async () => "removed" as const,
  forgetSandboxParents: async () => undefined,
};

type Exit = { code: number | null; signal: string | null };

/** A program a test controls: it ends when `end` is called or it is killed. */
interface FakeRun {
  request: RunRequest;
  killed: boolean;
  end(code: number | null): void;
  program: RunningProgram;
}

function stream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (text !== "") controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

/** How the fake fence answers the fence probe. */
export interface Probe {
  control: string;
  canary: string;
  port: string;
  /** Really connects to the canary port, as a leaking fence would let a program do. */
  leak?: boolean;
  /** Writes this instead of a report. */
  garbage?: string;
  /** What the probe writes to its error stream. */
  errors?: string;
  launchFails?: boolean;
}

export const fenced: Probe = { control: "readable", canary: "hidden", port: "blocked" };

/** A runner whose probe answers as told and whose other programs the test ends. */
export function fakeRunner(probe: Probe = fenced) {
  const runs: FakeRun[] = [];
  const probes: RunRequest[] = [];
  const runner: Runner = {
    async run(request) {
      if (basename(request.args[0] ?? "").startsWith(probeFilePrefix)) {
        probes.push(request);
        if (probe.launchFails) throw new Error("spawn bwrap ENOENT");
        if (probe.leak) {
          const port = Number(request.args[3]);
          await new Promise<void>((resolve) => {
            // The canary server hangs up on whoever it reaches, so waiting for
            // the close means it has already seen this connection.
            const socket = connect({ host: "127.0.0.1", port });
            socket.on("error", () => {});
            socket.on("close", () => resolve());
          });
        }
        return {
          stdin: new WritableStream(),
          stdout: stream(probe.garbage ?? `${JSON.stringify(probe)}\n`),
          stderr: stream(probe.errors ?? ""),
          ended: Promise.resolve({ code: 0, signal: null }),
          killTree: () => {},
        };
      }
      let finish: (exit: Exit) => void = () => {};
      const ended = new Promise<Exit>((resolve) => {
        finish = resolve;
      });
      const run: FakeRun = {
        request,
        killed: false,
        end: (code) => finish({ code, signal: null }),
        program: {
          stdin: new WritableStream(),
          stdout: stream(""),
          stderr: stream(""),
          ended,
          killTree: () => {
            run.killed = true;
            finish({ code: null, signal: "SIGKILL" });
          },
        },
      };
      runs.push(run);
      return run.program;
    },
  };
  return { runner, runs, probes };
}

export function makeProfile(base: string, overrides: Partial<SandboxProfile> = {}): SandboxProfile {
  return {
    workingFolder: join(base, "work"),
    tempFolder: join(base, "temp"),
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: { HOME: "/nowhere" },
    network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 60_000,
    ...overrides,
  };
}

export const command = { program: "echo", args: ["hi"] };
