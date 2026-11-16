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
 * - `reads-open-by-default`: the sandbox reads whatever the Users group can read, unless a path is denied.
 * - `wsl-service-reachable`: the WSL service answers sandboxed programs, and `wsl.exe` can't be denied.
 * - `kept-roots-readable`: the folders Halonic keeps outside a project can be read. Only a
 *   residual of an `ok` check on Windows, when another program's srt setup lets every
 *   session read the profile, or the setup can't be read; no backend lists it as a limit (HAL-5398).
 * - `files-leave-machine`: project files are copied to another machine.
 * - `project-folder-writable`: the project folder is writable (true for every backend).
 * - `no-file-fence`, `no-network-fence`: with no sandbox, nothing fences files or the network.
 * - `anonymous-loopback`, `deny-only-user-sid`, `lowered-integrity-unprobed`: srt's own
 *   residuals on Windows, as `srt-win wfp verify` reports them.
 * - `security-updates-overdue`: a backend with its own system updates (`srt-wsl`, W2 of
 *   HAL-5407) hasn't run them for more than 7 days. A warning, never a failure.
 */
export const limitCodes = [
  "name-lookups-leave",
  "service-traffic-unfenced",
  "token-switch-unfenced",
  "schannel-tls-fails",
  "reads-open-by-default",
  "wsl-service-reachable",
  "kept-roots-readable",
  "files-leave-machine",
  "project-folder-writable",
  "no-file-fence",
  "no-network-fence",
  "anonymous-loopback",
  "deny-only-user-sid",
  "lowered-integrity-unprobed",
  "security-updates-overdue",
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
  /**
   * For a backend that updates its own system (`srt-wsl`'s distro): whether
   * those security updates are overdue. The choice asks at every start, after
   * the trust check passed. Never throws: a failure counts as overdue with no date.
   */
  securityUpdates?(): Promise<SecurityUpdatesState>;
  /** The trust check's canary. Every backend has one: none runs steps before it passes. */
  canary: TrustCanary;
  /** The backend's one-time download, for a backend that needs one before it can run. MXC's SDK is one. */
  setup?: BackendSetup;
}

/**
 * Where a backend's security updates stand. `last` is when they last ran, as
 * the backend printed it, or `null` when they never did or it didn't say.
 */
export type SecurityUpdatesState = { overdue: false } | { overdue: true; last: string | null };

/** A backend's one-time download. It starts only when the host calls {@link SandboxChoiceService.download}, which the host does when the person picks the backend. */
export interface BackendSetup {
  /** Whether the backend is offered here but still needs its download. Never throws. */
  downloadNeeded(): Promise<boolean>;
  /** Downloads it. Never throws: a failure is `done: false` with a sentence for logs and support. */
  download(): Promise<{ done: true } | { done: false; problem: string }>;
}

/**
 * Every state a backend can be in. The list is closed: a new state is a
 * change here, through a task that names it, with words in the design first.
 *
 * - `in-use`: the backend passed its trust check and runs the steps.
 * - `available`: the backend works here, but is not the one in use.
 * - `setup-needed`: something must be done once first, as `reason` says. A pending download is
 *   `reason: "download-needed"` with `setup: "download"`, and the backend has had no check and no
 *   trust check.
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
  /** Why the backend can't run or failed its trust check, `download-needed` while its download is open, or `null`. */
  reason: SandboxUnavailableReason | TrustCheckFailure | "download-needed" | null;
  /** What the person still has to do for a download, or `null`. */
  setup: "download" | null;
  /** The sentences behind `reason`, for logs and support, not for people. Behind `download-needed`: the last failed download, empty before the first try. */
  missing: string[];
  /** What the backend does not protect: static, from the backend. */
  limits: LimitCode[];
  /** What this start's trust check saw that it does not protect. Empty unless the backend is in use. */
  residuals: LimitCode[];
  /**
   * When security updates last ran, while `security-updates-overdue` is a
   * residual: `null` for "no date" (never, or unknown). Absent otherwise.
   */
  securityUpdatesLast?: string | null;
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
 * after its check and its trust check. `none` runs no
 * sandbox. With no setting, the first of {@link defaultBackendOrder} that
 * passes runs. A failure never falls through to another backend: nothing
 * runs in a fence the person didn't pick. One instance lives for one start
 * of Halonic: a failed trust check keeps that backend off until the next
 * start, and the saved setting stays as the person left it. A backend whose
 * download is pending is `setup-needed` without a trust check, and nothing
 * else runs in its place. Only {@link SandboxChoiceService.download}
 * downloads.
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
  readonly #downloadProblems = new Map<SandboxBackendId, string>();
  #queue: Promise<unknown> = Promise.resolve();

  /** @throws when two backends have one id, or a backend has no canary */
  constructor(options: SandboxChoiceOptions) {
    this.#platform = options.platform;
    this.#backends = options.backends;
    this.#settings = options.settings;
    const ids = new Set(options.backends.map((backend) => backend.id));
    if (ids.size !== options.backends.length) {
      throw new Error("Two sandbox backends have the same id.");
    }
    for (const backend of options.backends) {
      if (backend.canary === undefined) {
        throw new Error(`The ${backend.id} sandbox backend has no trust canary.`);
      }
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

  /**
   * Downloads a backend's one-time download when it is still needed, then
   * chooses again from the saved setting. The host calls this only when the
   * person picks the backend: starting, a settings change and `not-fenced`
   * never download. A download that fails leaves the backend `setup-needed`,
   * with the sentence behind it, and can be tried again.
   *
   * Save the person's pick before calling: choosing again reads it.
   *
   * @throws when no backend has this id, or the saved setting can't be read
   */
  download(id: SandboxBackendId): Promise<SandboxChoice> {
    return this.#enqueue(async () => {
      const backend = this.#backends.find((candidate) => candidate.id === id);
      if (backend === undefined) throw new Error(`The ${id} sandbox backend is missing.`);
      if (backend.setup !== undefined && (await backend.setup.downloadNeeded())) {
        const result = await backend.setup.download();
        if (result.done) this.#downloadProblems.delete(id);
        else this.#downloadProblems.set(id, result.problem);
      }
      return this.#decide();
    });
  }

  /** The latest choice, or `null` before {@link SandboxChoiceService.start}. */
  current(): SandboxChoice | null {
    return this.#choice;
  }

  /** One update at a time, so two triggers never run two trust checks at once. */
  #update(): Promise<SandboxChoice> {
    return this.#enqueue(() => this.#decide());
  }

  #enqueue(task: () => Promise<SandboxChoice>): Promise<SandboxChoice> {
    const next = this.#queue.then(task);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  async #decide(): Promise<SandboxChoice> {
    this.#choice = await this.#choose();
    return this.#choice;
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

  /** A backend's offer, download and own check, before any trust check. */
  async #statusOf(backend: SandboxBackend): Promise<SandboxBackendStatus> {
    const status: SandboxBackendStatus = {
      id: backend.id,
      offered: await backend.offered(),
      state: "not-available",
      reason: null,
      setup: null,
      missing: [],
      limits: [...backend.limits],
      residuals: [],
    };
    if (!status.offered) return status;
    // Before the check, which can't say more than `other` until the download is done.
    if ((await backend.setup?.downloadNeeded()) === true) {
      const problem = this.#downloadProblems.get(backend.id);
      status.state = "setup-needed";
      status.reason = "download-needed";
      status.setup = "download";
      status.missing = problem === undefined ? [] : [problem];
      return status;
    }
    const check = await backend.sandbox.check();
    if (check.ok) {
      status.state = "available";
      status.residuals = [...(check.residuals ?? [])];
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
      this.#failures.get(backend.id) ?? (await runTrustCheck(backend.sandbox, backend.canary));
    if (result.passed) {
      status.state = "in-use";
      if (result.nameLookupsLeave) status.residuals.push("name-lookups-leave");
      await this.#noteSecurityUpdates(backend, status);
      return true;
    }
    this.#failures.set(backend.id, result);
    status.state = "check-failed";
    status.reason = result.reason;
    status.missing = [...result.missing];
    return false;
  }

  /** Adds `security-updates-overdue` as a residual when the backend says its updates are late. */
  async #noteSecurityUpdates(backend: SandboxBackend, status: SandboxBackendStatus): Promise<void> {
    if (backend.securityUpdates === undefined) return;
    let state: SecurityUpdatesState;
    try {
      state = await backend.securityUpdates();
    } catch {
      // A warning beats silence: a backend that can't say is treated as overdue.
      state = { overdue: true, last: null };
    }
    if (!state.overdue) return;
    status.residuals.push("security-updates-overdue");
    status.securityUpdatesLast = state.last;
  }
}
