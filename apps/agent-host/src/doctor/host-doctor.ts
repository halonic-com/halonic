// The checks of Studio's "Check this computer" that need Node (HAL-13407):
// `halonic doctor`'s own service, from `adapter-doctor-node`, on the parts
// the agent host already runs. It answers facts and ids, never words, and
// only the lines the host can answer for: Studio's page builds the key
// lines, Default model and Last run itself, and the host's Node.js isn't the
// person's.

import { basename } from "node:path";
import {
  type CommandSearch,
  type DoctorServiceMachine,
  doctorService,
  type ReadWorkspace,
  readDoctorWorkspace,
  type SandboxKind,
  studioWatchedFileLimit,
  windowsDriveOf,
} from "@halonicjs/adapter-doctor-node";
import {
  type AnyDoctorLine,
  type DoctorAction,
  type DoctorReport,
  type DoctorSummary,
  type DoctorWorkspace,
  doctorLineActions,
  doctorSummary,
} from "@halonicjs/app";
import type { Secrets } from "@halonicjs/ports";
import { readOnlyTrustStore } from "./read-only-trust-store.ts";

/** The lines the host answers, in the order `halonic doctor` prints them. */
const answeredLines = ["workspace", "models", "sandbox", "harnesses", "network", "disk"] as const;

/**
 * One line of the answer: the line's facts, as the doctor service found
 * them, and the actions it offers. A ready Sandbox line also names the kind
 * of sandbox the host runs (requirement `agent-host.doctor-sandbox-kind`):
 * on Windows the host runs either on Windows itself or inside Halonic's WSL
 * distro, and only the host knows which.
 */
export type HostDoctorLine = AnyDoctorLine & {
  readonly actions: DoctorAction[];
  readonly sandboxKind?: SandboxKind;
};

/** The host's answer: its lines and their counts. */
export interface HostDoctorAnswer {
  readonly checks: HostDoctorLine[];
  readonly summary: DoctorSummary;
}

/** What the host's doctor runs on. */
export interface HostDoctorParts {
  /** The parts the doctor service asks; its trust store is made read only here. */
  readonly machine: DoctorServiceMachine;
  /** The host's version, which a trust check would record. */
  readonly appVersion: string;
  /** Where the connectors' programs are looked for, as the trust check fingerprints them. */
  readonly commandSearch: CommandSearch;
  /** Whether the host runs inside WSL, where a workspace on a Windows drive gets a warning. */
  readonly onWsl: boolean;
  /** The kind of sandbox the host runs, for a ready Sandbox line; `undefined` on a system srt doesn't run on. */
  readonly sandboxKind: SandboxKind | undefined;
}

/** Why the host gave no answer. */
export type HostDoctorRefusal = "busy" | "no_workspace";

/**
 * The secrets store the doctor service needs but the host never uses: the
 * host holds no keychain, and the key lines are left out, so nothing asks.
 * Should something ask, the line says the store couldn't be read, never
 * that a key is missing.
 */
const noKeychain: Secrets = {
  get: () => Promise.reject(new Error("The agent host holds no keys.")),
};

/**
 * Runs the doctor for Studio, one check at a time (requirement
 * `agent-host.doctor-route`). It writes nothing: the trust records are read
 * only, the agents' own sign-ins aren't asked (asking runs their program on
 * a settings folder in the profile, which it may write to), and the
 * workspace is only read. A model server is asked only on this computer
 * until the workspace is trusted, and a cloud provider never.
 */
export class HostDoctor {
  readonly #parts: HostDoctorParts;
  #running = false;

  constructor(parts: HostDoctorParts) {
    this.#parts = parts;
  }

  /**
   * The checks of this computer, and of the workspace in `workspaceRoot`
   * when one is given.
   *
   * @param workspaceRoot - a folder the launcher named, as a real path; `null` checks only the computer
   * @returns the answer, or `busy` while another check runs, or `no_workspace` for a folder without `workspace.yaml`
   * @throws when the workspace's files or the trust records can't be read
   */
  async check(workspaceRoot: string | null): Promise<HostDoctorAnswer | HostDoctorRefusal> {
    if (this.#running) return "busy";
    this.#running = true;
    try {
      return await this.#check(workspaceRoot);
    } finally {
      this.#running = false;
    }
  }

  async #check(workspaceRoot: string | null): Promise<HostDoctorAnswer | HostDoctorRefusal> {
    const read = workspaceRoot === null ? null : await this.#read(workspaceRoot);
    if (read === undefined) return "no_workspace";
    const workspace =
      read === null
        ? null
        : { workspace: this.#hostWorkspace(read), providerFiles: read.providerFiles };
    const machine = {
      ...this.#parts.machine,
      trustStore: readOnlyTrustStore(this.#parts.machine.trustStore),
    };
    const doctor = await doctorService(machine, noKeychain, workspace, {
      appVersion: this.#parts.appVersion,
    });
    return answerOf(await doctor.check(workspace?.workspace ?? null), this.#parts.sandboxKind);
  }

  /** The workspace in `root`, or `undefined` when it has no `workspace.yaml`. */
  async #read(root: string): Promise<ReadWorkspace | undefined> {
    const read = await readDoctorWorkspace(
      { root, shown: root, name: basename(root) },
      { watchedFileLimit: studioWatchedFileLimit, commandSearch: this.#parts.commandSearch },
    );
    return read ?? undefined;
  }

  /**
   * What the host checks of the workspace, named field by field so nothing
   * else reaches the service: its trust, files and watch limit, and its
   * model servers on this computer. Its secrets, its cloud providers' keys
   * and its default model are the page's to check.
   */
  #hostWorkspace({ workspace }: ReadWorkspace): DoctorWorkspace {
    const providers = workspace.providers.filter(
      (provider) => provider.runs === "on-this-computer",
    );
    const onThisComputer = new Set(providers.map((provider) => provider.provider));
    const drive = this.#parts.onWsl ? windowsDriveOf(workspace.trust.location) : null;
    return {
      name: workspace.name,
      trust: workspace.trust,
      aliases: workspace.aliases.filter((alias) => onThisComputer.has(alias.provider)),
      providers,
      ...(workspace.testModelOnly === undefined ? {} : { testModelOnly: workspace.testModelOnly }),
      ...(workspace.fileProblems === undefined ? {} : { fileProblems: workspace.fileProblems }),
      ...(workspace.tooManyFilesToWatch === undefined
        ? {}
        : { tooManyFilesToWatch: workspace.tooManyFilesToWatch }),
      ...(drive === null ? {} : { windowsDrive: drive }),
    };
  }
}

/** The answered lines of `report`, each with its actions, and their counts. */
function answerOf(report: DoctorReport, sandboxKind: SandboxKind | undefined): HostDoctorAnswer {
  const checks = answeredLines.flatMap((check): HostDoctorLine[] => {
    const line = report[check];
    return line === undefined ? [] : [answeredLine(line, sandboxKind)];
  });
  return { checks, summary: doctorSummary(checks) };
}

/** `line` with its actions, and the sandbox's kind when it is a ready Sandbox line and the kind is known. */
function answeredLine(line: AnyDoctorLine, sandboxKind: SandboxKind | undefined): HostDoctorLine {
  const answered = { ...line, actions: doctorLineActions(line) };
  const ready = line.check === "sandbox" && line.status === "ok";
  return ready && sandboxKind !== undefined ? { ...answered, sandboxKind } : answered;
}
