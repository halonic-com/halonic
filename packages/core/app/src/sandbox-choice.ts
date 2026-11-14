// Which sandbox backend runs agent steps on this computer, and the state of
// every backend Halonic knows (HAL-3779 design, sections 2.2-2.4). It reports
// codes, never sentences: Studio and the CLI word them from the
// board-approved design.

import {
  isSandboxSetting,
  type Sandbox,
  type SandboxBackendId,
  type SandboxSetting,
  type SandboxSettingStore,
  type SandboxUnavailableReason,
  sandboxBackendIds,
} from "@halonicjs/ports";
import {
  runTrustCheck,
  type TrustCanary,
  type TrustCheckFailure,
  type TrustCheckResult,
} from "./sandbox-trust-check.ts";

export { type SandboxBackendId, sandboxBackendIds };

/**
 * What a backend does not protect, as a closed list of codes. A new code is
 * a change here, through a task that names it, with words in the design first.
 *
 * - `name-lookups-leave`: name lookups leave through the operating system's DNS service.
 * - `service-traffic-unfenced`: traffic of the system's own services isn't fenced.
 * - `token-switch-unfenced`: a program that switches its security token isn't fenced.
 * - `schannel-tls-fails`: Windows' own TLS library can't make connections inside.
 * - `kept-roots-readable`: the folders Halonic keeps outside a project can be read.
 * - `files-leave-machine`: project files are copied to another machine.
 * - `project-folder-writable`: the project folder is writable (true for every backend).
 * - `anonymous-loopback`, `deny-only-user-sid`, `lowered-integrity-unprobed`: srt's own
 *   residuals on Windows, as `srt-win wfp verify` reports them.
 */
export const limitCodes = [
  "name-lookups-leave",
  "service-traffic-unfenced",
  "token-switch-unfenced",
  "schannel-tls-fails",
  "kept-roots-readable",
  "files-leave-machine",
  "project-folder-writable",
  "anonymous-loopback",
  "deny-only-user-sid",
  "lowered-integrity-unprobed",
] as const;

/** A limit of a backend: one of {@link limitCodes}. */
export type LimitCode = (typeof limitCodes)[number];

/** A sandbox backend as the host hands it over. */
export interface SandboxBackend {
  id: SandboxBackendId;
  /**
   * Whether this computer offers the backend at all, such as MXC only on
   * Windows 11 client editions. Not offered is not a failure: there is no
   * check and nothing for the person to read.
   */
  offered(): Promise<boolean>;
  sandbox: Pick<Sandbox, "check" | "open">;
  /** What this backend does not protect: facts about the backend, fixed. */
  limits: readonly LimitCode[];
  /** The trust check's canary, for a backend used only after it passes one. MXC needs one. */
  canary?: TrustCanary;
}

/**
 * Every state a backend can be in. The list is closed: a new state is a
 * change here, through a task that names it, with words in the design first.
 *
 * - `in-use`: the backend passed its trust check and runs the steps.
 * - `available`: the backend works here, but is not the one in use.
 * - `setup-needed`: something must be done once first, as `reason` says.
 * - `check-failed`: the trust check failed, so the backend is off until Halonic starts again.
 * - `not-available`: this computer offers the backend, but it can't run, as `reason` says.
 *   A backend that isn't offered is `offered: false` and shows nothing.
 */
export const sandboxBackendStates = [
  "in-use",
  "available",
  "setup-needed",
  "check-failed",
  "not-available",
] as const;

/** A state of a backend: one of {@link sandboxBackendStates}. */
export type SandboxBackendState = (typeof sandboxBackendStates)[number];

/** The reasons that mean "do something once, then it works". The rest are `not-available`. */
const setupReasons: readonly SandboxUnavailableReason[] = [
  "setup-needed",
  "setup-conflict",
  "wsl-missing",
  "restart-needed",
  "distro-missing",
  "sign-in-needed",
  "bubblewrap-missing",
  "linux-tools-missing",
  "ripgrep-missing",
  "user-namespaces-restricted",
];

/** One backend in a {@link SandboxChoice}. */
export interface SandboxBackendStatus {
  id: SandboxBackendId;
  /** Whether this computer offers the backend. Not offered: show nothing. */
  offered: boolean;
  state: SandboxBackendState;
  /** Why the backend can't run or failed its trust check, or `null`. */
  reason: SandboxUnavailableReason | TrustCheckFailure | null;
  /** The sentences behind `reason`, for logs and support, not for people. */
  missing: string[];
  /** What the backend does not protect: static, from the backend. */
  limits: LimitCode[];
  /** What this start's trust check saw that it does not protect. Empty unless the backend is in use. */
  residuals: LimitCode[];
}

/** Which sandbox runs, for Studio and the CLI. */
export interface SandboxChoice {
  /**
   * The backend agent steps run in, `"none"` when the person chose to
   * continue without a sandbox, or `null` when steps don't run: the chosen
   * backend can't run or failed its check, or none is chosen and none of the
   * platform's defaults works.
   */
  active: SandboxBackendId | "none" | null;
  /** The person's setting as saved, or `null` when they haven't chosen. A failed check never changes it. */
  setting: SandboxSetting | null;
  /** Every backend the host handed over, in the order it gave them. */
  backends: SandboxBackendStatus[];
}

/**
 * The backends the CLI and headless runs try, in order, when nothing is
 * chosen (design 2.4). Windows runs srt inside WSL only: native srt and MXC
 * are used only when the setting names them. The CLI never picks `none`.
 *
 * @example
 * defaultBackendOrder("win32"); // ["srt-wsl"]
 */
export function defaultBackendOrder(platform: string): SandboxBackendId[] {
  return platform === "win32" ? ["srt-wsl"] : ["srt"];
}

/** What {@link SandboxChoiceService} needs from the host. */
export interface SandboxChoiceOptions {
  /** The operating system, as Node's `process.platform` names it. */
  platform: string;
  /** The backends this build has, in the order Studio shows them. MXC comes with its canary. */
  backends: readonly SandboxBackend[];
  /** Where the person's choice is saved. */
  settings: Pick<SandboxSettingStore, "get">;
}

/**
 * Chooses the sandbox backend from the person's saved setting (requirement
 * `app.sandbox-choice`). A setting that names a backend runs only that one,
 * after its check and, with a canary, its trust check. `none` runs no
 * sandbox. With no setting, the first of {@link defaultBackendOrder} that
 * passes runs. A failure never falls through to another backend: nothing
 * runs in a fence the person didn't pick. One instance lives for one start
 * of Halonic: a failed trust check keeps that backend off until the next
 * start, and the saved setting stays as the person left it.
 *
 * @example
 * const choice = new SandboxChoiceService({ platform: "linux", backends: [srt], settings });
 * await choice.start();
 * // { active: "srt", setting: null, backends: [{ id: "srt", state: "in-use", ... }] }
 */
export class SandboxChoiceService {
  readonly #platform: string;
  readonly #backends: readonly SandboxBackend[];
  readonly #settings: Pick<SandboxSettingStore, "get">;
  #choice: SandboxChoice | null = null;
  readonly #failures = new Map<SandboxBackendId, TrustCheckResult & { passed: false }>();
  #queue: Promise<unknown> = Promise.resolve();

  /** @throws when two backends have one id, or MXC has no canary */
  constructor(options: SandboxChoiceOptions) {
    this.#platform = options.platform;
    this.#backends = options.backends;
    this.#settings = options.settings;
    const ids = new Set(options.backends.map((backend) => backend.id));
    if (ids.size !== options.backends.length) {
      throw new Error("Two sandbox backends have the same id.");
    }
    if (options.backends.some((backend) => backend.id === "mxc" && backend.canary === undefined)) {
      throw new Error("The mxc sandbox backend has no trust canary.");
    }
  }

  /** At startup: reads the setting and chooses, with a trust check for the backend that would run. */
  start(): Promise<SandboxChoice> {
    return this.#update();
  }

  /** After every change to the sandbox setting: chooses again. */
  settingsChanged(): Promise<SandboxChoice> {
    return this.#update();
  }

  /** When a session's fence proof is `not-fenced`: checks the backend in use again. */
  sessionNotFenced(): Promise<SandboxChoice> {
    return this.#update();
  }

  /** The latest choice, or `null` before {@link SandboxChoiceService.start}. */
  current(): SandboxChoice | null {
    return this.#choice;
  }

  /** One update at a time, so two triggers never run two trust checks at once. */
  #update(): Promise<SandboxChoice> {
    const next = this.#queue.then(async () => {
      this.#choice = await this.#choose();
      return this.#choice;
    });
    this.#queue = next.catch(() => undefined);
    return next;
  }

  /** @throws when the saved setting can't be read or isn't a valid setting */
  async #choose(): Promise<SandboxChoice> {
    const setting = await this.#settings.get();
    if (setting !== null && !isSandboxSetting(setting)) {
      throw new Error("The sandbox settings store gave back a setting that isn't valid.");
    }
    const statuses = await Promise.all(this.#backends.map((backend) => this.#statusOf(backend)));

    let active: SandboxChoice["active"] = null;
    if (setting?.backend === "none") {
      active = "none";
    } else {
      const candidates = setting === null ? defaultBackendOrder(this.#platform) : [setting.backend];
      for (const id of candidates) {
        const index = this.#backends.findIndex((backend) => backend.id === id);
        const backend = this.#backends[index];
        const status = statuses[index];
        if (backend === undefined || status === undefined || status.state !== "available") continue;
        if (await this.#trust(backend, status)) {
          active = id;
          break;
        }
      }
    }
    return { active, setting, backends: statuses };
  }

  /** A backend's offer and own check, before any trust check. */
  async #statusOf(backend: SandboxBackend): Promise<SandboxBackendStatus> {
    const status: SandboxBackendStatus = {
      id: backend.id,
      offered: await backend.offered(),
      state: "not-available",
      reason: null,
      missing: [],
      limits: [...backend.limits],
      residuals: [],
    };
    if (!status.offered) return status;
    const check = await backend.sandbox.check();
    if (check.ok) {
      status.state = "available";
    } else {
      status.state = setupReasons.includes(check.reason) ? "setup-needed" : "not-available";
      status.reason = check.reason;
      status.missing = [...check.missing];
    }
    return status;
  }

  /**
   * Runs a backend's trust check, unless one already failed in this start,
   * and records the outcome in its status.
   *
   * @returns whether the backend passed and is now in use
   */
  async #trust(backend: SandboxBackend, status: SandboxBackendStatus): Promise<boolean> {
    const result =
      this.#failures.get(backend.id) ??
      (backend.canary === undefined
        ? ({ passed: true, nameLookupsLeave: false } as const)
        : await runTrustCheck(backend.sandbox, backend.canary));
    if (result.passed) {
      status.state = "in-use";
      if (result.nameLookupsLeave) status.residuals = ["name-lookups-leave"];
      return true;
    }
    this.#failures.set(backend.id, result);
    status.state = "check-failed";
    status.reason = result.reason;
    status.missing = [...result.missing];
    return false;
  }
}
