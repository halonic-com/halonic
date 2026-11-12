// The fence proof at `open`, before any program of the caller starts: a probe
// program runs in the box under the real policy and must find the hidden file
// and the denied file inside the readable folder unreadable, the loopback port
// of a listener on this computer unreachable, and the allowed folder's control
// file readable (without that control, "hidden" proves nothing). Anything
// else, including a probe that couldn't run, is `not-fenced`.

import type { SandboxCommand, SandboxFence, SandboxProcess } from "@halonicjs/ports";
import type { MxcDisk } from "./disk.ts";
import { type FenceFiles, writeFenceFiles } from "./fence-files.ts";
import { listenOnLoopback } from "./loopback-listener.ts";
import { parseLeakReport } from "./probe-scripts.ts";
import { errorLine, runToEnd } from "./run-to-end.ts";

/** How long the probe may take before the fence counts as unproven. */
const probeTimeoutMs = 15_000;

/** What the proof needs. */
export interface FenceProofInput {
  disk: MxcDisk;
  files: FenceFiles;
  /** Starts `command` in the box under the session's policy, plus the proof's own folder and the Node folder. */
  launch(command: SandboxCommand): Promise<SandboxProcess>;
  /** The Node program the probe runs as. */
  nodeProgram: string;
}

/**
 * Runs the fence's own probes. `fenced` only when the probe ran inside the
 * box, read the allowed folder, and was refused the rest. Never throws: a
 * probe that can't run is `not-fenced`, with the sentence that says why.
 */
export async function proveFence(input: FenceProofInput): Promise<SandboxFence> {
  const { files } = input;
  const listener = await listenOnLoopback("127.0.0.1");
  try {
    if (listener === null) throw new Error("this computer can't listen on 127.0.0.1");
    await writeFenceFiles(input.disk, files);
    const ports = [{ host: listener.host, port: listener.port }];
    const settings = { control: files.control, hidden: files.canary, denied: files.denied, ports };
    await input.disk.writeText(files.config, JSON.stringify(settings));
    const probe = await input.launch({
      program: input.nodeProgram,
      args: [files.script, files.config],
    });
    const { stdout, stderr, exit } = await runToEnd(probe, probeTimeoutMs);
    if (listener.reached()) {
      return notFenced("a program inside the fence reached a loopback port it should not reach");
    }
    const report = parseLeakReport(stdout);
    if (report === null) {
      const detail = errorLine(stderr);
      return notFenced(
        `the fence probe did not report (exit ${exit.code ?? exit.signal})${detail === "" ? "" : `: ${detail}`}`,
      );
    }
    if (report.control !== "readable") {
      return notFenced(
        "the fence probe could not read the allowed folder, so its result proves nothing",
      );
    }
    if (report.hidden !== "hidden") {
      return notFenced("a program inside the fence could read a file the fence should hide");
    }
    if (report.denied !== "hidden") {
      return notFenced(
        "a program inside the fence could read a denied file inside a folder it may read",
      );
    }
    if (
      report.ports.length !== ports.length ||
      report.ports.some((port) => port.state !== "blocked")
    ) {
      return notFenced(
        "a program inside the fence could connect to a loopback port it should not reach",
      );
    }
    return { state: "fenced" };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return notFenced(`the fence probe could not run: ${why}`);
  } finally {
    listener?.close();
  }
}

function notFenced(reason: string): SandboxFence {
  return { state: "not-fenced", reason };
}
