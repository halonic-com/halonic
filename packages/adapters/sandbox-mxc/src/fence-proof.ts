// The fence proof at `open`, before any program of the caller starts: a probe
// program runs in the box under the real policy and must find the hidden file
// and the denied file inside the readable folder unreadable, the ports of
// listeners on this computer (loopback and its other addresses) unreachable,
// the router's usual address and a neighbour in each private range unreachable,
// the internet and public DNS servers unreachable, and the allowed folder's
// control file readable (without that control, "hidden" proves nothing). A
// network probe that failed for another reason than a refusal proves nothing
// either (`network-probes.ts`). Anything else, including a probe that couldn't
// run, is `not-fenced`.
//
// A profile with no bridge has no network control to connect to, so the proof
// runs a control box first: the same policy with a dead-end bridge, on the same
// computer, right before. If the control box reached its bridge and every
// attempt it made to the outside was blocked, a timeout in the real box counts
// as blocked too, but only on a target where the control box timed out as well:
// where it was refused instead, the two boxes behaved differently and the
// control's evidence does not carry over. The limit: the control runs in a twin
// box, not in the box that is proven. Cost: a profile with no bridge runs two
// probes at `open`, up to 15 s each, and both count against the time limit.

import type { SandboxBridge, SandboxCommand, SandboxFence, SandboxProcess } from "@halonicjs/ports";
import type { MxcDisk } from "./disk.ts";
import { type FenceFiles, writeFenceFiles } from "./fence-files.ts";
import { hostAddressTargets } from "./lan-targets.ts";
import { type LoopbackListener, listenOnLoopback, listenOnLoopbacks } from "./loopback-listener.ts";
import {
  type ControlBoxStates,
  controlBoxStates,
  judgeNetwork,
  type NetworkAsked,
  networkSettings,
} from "./network-probes.ts";
import { type LeakReport, parseLeakReport } from "./probe-scripts.ts";
import { errorLine, runToEnd } from "./run-to-end.ts";

/** How long the probe may take before the fence counts as unproven. */
const probeTimeoutMs = 15_000;

/** What the proof needs. */
export interface FenceProofInput {
  disk: MxcDisk;
  files: FenceFiles;
  /** Starts `command` in the box under the session's policy, plus the proof's own folder and the Node folder. */
  launch(command: SandboxCommand): Promise<SandboxProcess>;
  /**
   * Starts `command` in a control box: the session's policy, with `bridge` as its
   * bridge. Only a profile with no bridge needs it.
   */
  launchControl(command: SandboxCommand, bridge: SandboxBridge): Promise<SandboxProcess>;
  /** The Node program the probe runs as. */
  nodeProgram: string;
  /** The bridge the session's profile allows: the probe's network control. `null` when it has none. */
  bridge: SandboxBridge | null;
}

/**
 * Runs the fence's own probes. `fenced` only when the probe ran inside the
 * box, read the allowed folder, and was refused the rest. Never throws: a
 * probe that can't run is `not-fenced`, with the sentence that says why.
 */
export async function proveFence(input: FenceProofInput): Promise<SandboxFence> {
  const { files } = input;
  let listeners: LoopbackListener[] = [];
  try {
    listeners = await listenOnLoopbacks();
    await writeFenceFiles(input.disk, files);
    const ports = [...listeners.map(({ host, port }) => ({ host, port })), ...hostAddressTargets()];
    const network = networkSettings(input.bridge);
    let controlBox: ControlBoxStates | null = null;
    if (input.bridge === null) {
      const control = await proveControlBox(input, network);
      if (typeof control === "string") return notFenced(control);
      controlBox = control;
    }
    const settings = {
      control: files.control,
      hidden: files.canary,
      denied: files.denied,
      ports,
      ...network,
    };
    await input.disk.writeText(files.config, JSON.stringify(settings));
    const probe = await input.launch({
      program: input.nodeProgram,
      args: [files.script, files.config],
    });
    const { stdout, stderr, exit } = await runToEnd(probe, probeTimeoutMs);
    if (listeners.some((listener) => listener.reached())) {
      return notFenced(
        "a program inside the fence reached a port of this computer it should not reach",
      );
    }
    const report = parseLeakReport(stdout);
    if (report === null) {
      const detail = errorLine(stderr);
      return notFenced(
        `the fence probe did not report (exit ${exit.code ?? exit.signal})${detail === "" ? "" : `: ${detail}`}`,
      );
    }
    const problem = problemWith(
      report,
      {
        ports: ports.length,
        lan: network.lan.length,
        internet: network.internet.length,
        dns: network.dns.length,
      },
      controlBox,
    );
    if (problem !== null) return notFenced(problem);
    return { state: "fenced" };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return notFenced(`the fence probe could not run: ${why}`);
  } finally {
    for (const listener of listeners) listener.close();
  }
}

/**
 * Runs the control box for a profile with no bridge: its probe must reach a dead-end
 * bridge, the network control, and be blocked from every address outside.
 *
 * @returns the sentence for why the control box proved nothing, or the state of each of its
 * attempts, so that the real box's timeouts are matched target by target
 */
async function proveControlBox(
  input: FenceProofInput,
  network: ReturnType<typeof networkSettings>,
): Promise<string | ControlBoxStates> {
  const bridge = await listenOnLoopback("127.0.0.1");
  if (bridge === null) return "the control box's bridge could not listen on 127.0.0.1";
  try {
    const settings = {
      control: input.files.control,
      hidden: input.files.canary,
      denied: input.files.denied,
      ports: [],
      ...network,
      bridge: { host: bridge.host, port: bridge.port },
    };
    await input.disk.writeText(input.files.controlConfig, JSON.stringify(settings));
    const probe = await input.launchControl(
      { program: input.nodeProgram, args: [input.files.script, input.files.controlConfig] },
      { kind: "loopback", host: bridge.host, port: bridge.port },
    );
    const { stdout, stderr, exit } = await runToEnd(probe, probeTimeoutMs);
    const report = parseLeakReport(stdout);
    if (report === null) {
      const detail = errorLine(stderr);
      return `the control box's probe did not report (exit ${exit.code ?? exit.signal})${detail === "" ? "" : `: ${detail}`}`;
    }
    if (report.network?.state !== "connected") {
      return "the control box's probe could not reach its bridge, so its network control shows nothing";
    }
    const found = judgeNetwork(report, {
      ports: 0,
      lan: network.lan.length,
      internet: network.internet.length,
      dns: network.dns.length,
    });
    if (found.unproven.length > 0) {
      return `the control box did not prove the block either: ${found.unproven[0]}`;
    }
    if (found.lanReached || found.internetReached || found.dnsReached) {
      return "the control box's probe reached the outside, so it can't stand in for the box";
    }
    return controlBoxStates(report);
  } finally {
    bridge.close();
  }
}

/** The sentence for what the probe's report shows is wrong with the fence, or `null` when nothing is. */
function problemWith(
  report: LeakReport,
  asked: NetworkAsked,
  controlBox: ControlBoxStates | null,
): string | null {
  if (report.control !== "readable") {
    return "the fence probe could not read the allowed folder, so its result proves nothing";
  }
  if (report.hidden !== "hidden") {
    return "a program inside the fence could read a file the fence should hide";
  }
  if (report.denied !== "hidden") {
    return "a program inside the fence could read a denied file inside a folder it may read";
  }
  const found = judgeNetwork(report, asked, controlBox);
  if (found.portReached) {
    return "a program inside the fence could connect to a port of this computer it should not reach";
  }
  if (found.lanReached) {
    return "a program inside the fence could connect to an address of the local network";
  }
  if (found.internetReached) {
    return "a program inside the fence could connect to an address on the internet";
  }
  if (found.dnsReached) {
    return "a program inside the fence got an answer from a public DNS server";
  }
  if (found.unproven.length > 0) {
    return `the network probes did not prove the block, so the fence is unproven: ${found.unproven[0]}`;
  }
  return null;
}

function notFenced(reason: string): SandboxFence {
  return { state: "not-fenced", reason };
}
