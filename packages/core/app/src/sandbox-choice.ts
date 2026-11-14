// Which sandbox backend runs agent steps on this computer, and the state of
// MXC, Windows 11's process container
// (docs/adr/2026-11-10-mxc-sandbox-backend.md, "Choosing a sandbox on
// Windows"). It reports codes, never sentences: Studio and the CLI word them
// from the board-approved design (HAL-3290).

import type { Sandbox } from "@halonicjs/ports";
import {
  runTrustCheck,
  type TrustCanary,
  type TrustCheckFailure,
  type TrustCheckResult,
} from "./sandbox-trust-check.ts";

/** Every sandbox backend Halonic knows. Phase 5 (HAL-3288) adds more here. */
export const sandboxBackendIds = ["srt", "mxc"] as const;

/** A sandbox backend: one of {@link sandboxBackendIds}. */
export type SandboxBackendId = (typeof sandboxBackendIds)[number];

/** A sandbox backend as the host hands it over. */
export interface SandboxBackend {
  id: SandboxBackendId;
  /**
   * Whether this computer offers the backend at all. MXC is offered only on
   * Windows 11 client editions with the BaseContainer tier. Not offered is
   * not a failure: there is no check and nothing for the person to read.
   */
  offered(): Promise<boolean>;
  sandbox: Pick<Sandbox, "check" | "open">;
  /** The trust check's canary, for a backend used only after it passes one. MXC needs one. */
  canary?: TrustCanary;
  /** The backend's one-time download, for a backend that needs one before it can run. MXC's SDK is one. */
  setup?: BackendSetup;
}

/** A backend's one-time download. It starts only when the host calls {@link SandboxChoiceService.downloadMxc}, which the host does when the person picks MXC. */
export interface BackendSetup {
  /** Whether the backend is offered here but still needs its download. Never throws. */
  downloadNeeded(): Promise<boolean>;
  /** Downloads it. Never throws: a failure is `done: false` with a sentence for logs and support. */
  download(): Promise<{ done: true } | { done: false; problem: string }>;
}

/** What a missing MXC setting means. */
export type MxcDefault = "opt-in" | "on";

/**
 * What a missing MXC setting means today. Turning MXC on by default is
 * changing this to `"on"` (HAL-3310), and nothing else.
 */
export const mxcDefault: MxcDefault = "opt-in";

/** The person's MXC setting: `on`, `off`, or `null` when they haven't set it. */
export type MxcSetting = "on" | "off" | null;

/** The person's sandbox settings. */
export interface SandboxSettings {
  mxc: MxcSetting;
}

/**
 * Every state MXC can be in. The list is closed: a new state is a change
 * here, through a task that names it, with words in the design first.
 *
 * - `not-offered`: this computer doesn't offer MXC. Nothing is shown.
 * - `off`: the setting is `off`, or not set while the default is opt-in.
 * - `in-use`: MXC passed its trust check and runs the steps.
 * - `not-used`: MXC would run, but srt came first.
 * - `mxc-check-failed`: the trust check failed, so MXC is off until Halonic starts again.
 * - `setup-needed`: MXC would run, but its one-time download isn't done (`setup: "download"`, `reason: "download-needed"`, also when the last try was offline). The trust check hasn't run.
 */
export const mxcStates = [
  "not-offered",
  "off",
  "in-use",
  "not-used",
  "mxc-check-failed",
  "setup-needed",
] as const;

/** A state of MXC: one of {@link mxcStates}. */
export type MxcState = (typeof mxcStates)[number];

/** The MXC part of a {@link SandboxChoice}. */
export type MxcStatus = {
  /** Whether this computer offers MXC. */
  offered: boolean;
  /** The setting, as the person left it. A failed check never changes it. */
  setting: MxcSetting;
  /** The setting in effect: the person's, or the default when they haven't set it. */
  effective: "on" | "off";
} & (
  | { state: "not-offered" | "off" | "not-used" }
  | {
      state: "in-use";
      /** Name lookups leave the box through Windows' DNS service: a known limit `doctor` shows. */
      nameLookupsLeave: boolean;
    }
  | {
      state: "mxc-check-failed";
      reason: TrustCheckFailure;
      /** The sentences behind the reason, for logs and support, not for people. */
      missing: string[];
    }
  | {
      state: "setup-needed";
      /** What the person still has to do: the one-time download. */
      setup: "download";
      /** Why MXC isn't running: the download isn't done, or the last try couldn't finish. */
      reason: "download-needed";
      /** The sentence behind the last failed download, for logs and support, not for people; empty before the first try. */
      missing: string[];
    }
);

/** Which sandbox runs, for Studio and the CLI. */
export interface SandboxChoice {
  /**
   * The backend agent steps run in, or `null` for none: then they don't run
   * (such as srt on Windows without its setup, `setup-needed`, and the D44
   * path).
   */
  active: SandboxBackendId | null;
  mxc: MxcStatus;
}

/** What {@link SandboxChoiceService} needs from the host. */
export interface SandboxChoiceOptions {
  /** The operating system, as Node's `process.platform` names it. */
  platform: string;
  /** Every backend in {@link sandboxBackendIds}, MXC with its canary. */
  backends: readonly SandboxBackend[];
  /** What a missing MXC setting means; {@link mxcDefault} when left out. */
  mxcDefault?: MxcDefault;
}

/**
 * Chooses the sandbox backend and runs MXC's trust check (requirement
 * `app.sandbox-choice`). On Windows, in this order: the person's explicit
 * choice (an MXC setting of `on`), then srt once its check passes there,
 * then MXC when the default is on, else none. Elsewhere srt. One instance
 * lives for one start of Halonic: a failed trust check keeps MXC off until
 * the next start, and the person's setting stays as they left it.
 *
 * @example
 * const choice = new SandboxChoiceService({ platform: "win32", backends: [srt, mxc] });
 * await choice.start({ mxc: "on" });
 * // { active: "mxc", mxc: { offered: true, setting: "on", effective: "on", state: "in-use", nameLookupsLeave: true } }
 */
export class SandboxChoiceService {
  readonly #platform: string;
  readonly #srt: SandboxBackend;
  readonly #mxc: SandboxBackend & { canary: TrustCanary };
  readonly #mxcDefault: MxcDefault;
  #settings: SandboxSettings = { mxc: null };
  #choice: SandboxChoice | null = null;
  #mxcFailure: TrustCheckResult | null = null;
  #downloadProblem: string | null = null;
  #queue: Promise<unknown> = Promise.resolve();

  /** @throws when a backend in {@link sandboxBackendIds} is missing, or MXC has no canary */
  constructor(options: SandboxChoiceOptions) {
    this.#platform = options.platform;
    this.#srt = backendOf(options.backends, "srt");
    const mxc = backendOf(options.backends, "mxc");
    if (mxc.canary === undefined) throw new Error("The mxc sandbox backend has no trust canary.");
    this.#mxc = { ...mxc, canary: mxc.canary };
    this.#mxcDefault = options.mxcDefault ?? mxcDefault;
  }

  /** At startup: chooses, running MXC's trust check when MXC would run. */
  start(settings: SandboxSettings): Promise<SandboxChoice> {
    return this.#update(settings);
  }

  /** After every change to the sandbox settings: chooses again, with a new trust check when MXC would run. */
  settingsChanged(settings: SandboxSettings): Promise<SandboxChoice> {
    return this.#update(settings);
  }

  /** When a session's fence proof is `not-fenced`: checks MXC again when it is in use. */
  sessionNotFenced(): Promise<SandboxChoice> {
    return this.#update(this.#settings);
  }

  /**
   * Downloads MXC's SDK when it is still needed, then chooses again. The host
   * calls this only when the person picks MXC; starting, a settings change
   * and the CLI never download by themselves. A download that fails leaves
   * MXC `setup-needed`, with the sentence behind it.
   *
   * Pass the settings with the person's pick (`mxc: "on"`): choosing again
   * uses them, so the pick takes effect without a separate settings change.
   */
  downloadMxc(settings: SandboxSettings = this.#settings): Promise<SandboxChoice> {
    return this.#enqueue(async () => {
      this.#settings = settings;
      const setup = this.#mxc.setup;
      if (setup !== undefined && (await setup.downloadNeeded())) {
        const result = await setup.download();
        this.#downloadProblem = result.done ? null : result.problem;
      }
      return this.#decide(settings);
    });
  }

  /** The latest choice, or `null` before {@link SandboxChoiceService.start}. */
  current(): SandboxChoice | null {
    return this.#choice;
  }

  /** One update at a time, so two triggers never run two trust checks at once. */
  #update(settings: SandboxSettings): Promise<SandboxChoice> {
    return this.#enqueue(() => this.#decide(settings));
  }

  #enqueue(task: () => Promise<SandboxChoice>): Promise<SandboxChoice> {
    const next = this.#queue.then(task);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  async #decide(settings: SandboxSettings): Promise<SandboxChoice> {
    this.#settings = settings;
    this.#choice = await this.#choose(settings.mxc);
    return this.#choice;
  }

  async #choose(setting: MxcSetting): Promise<SandboxChoice> {
    const windows = this.#platform === "win32";
    const [srtCheck, offered] = await Promise.all([
      this.#srt.sandbox.check(),
      windows ? this.#mxc.offered() : false,
    ]);
    const srt = srtCheck.ok ? "srt" : null;
    const effective = setting ?? (this.#mxcDefault === "on" ? "on" : "off");
    const facts = { offered, setting, effective } as const;

    if (!offered) return { active: srt, mxc: { ...facts, state: "not-offered" } };
    if (effective === "off") return { active: srt, mxc: { ...facts, state: "off" } };
    // An MXC setting of `on` is the person's explicit choice and comes before srt.
    if (setting !== "on" && srt !== null)
      return { active: srt, mxc: { ...facts, state: "not-used" } };

    // Nothing was tried yet, so nothing falls through to srt: the person picked MXC.
    if ((await this.#mxc.setup?.downloadNeeded()) === true) {
      const missing = this.#downloadProblem === null ? [] : [this.#downloadProblem];
      return {
        active: null,
        mxc: {
          ...facts,
          state: "setup-needed",
          setup: "download",
          reason: "download-needed",
          missing,
        },
      };
    }

    const trust = await this.#trustCheck();
    if (trust.passed) {
      return {
        active: "mxc",
        mxc: { ...facts, state: "in-use", nameLookupsLeave: trust.nameLookupsLeave },
      };
    }
    // A failed check never falls through to srt: nothing runs in a fence the person didn't pick.
    const { reason, missing } = trust;
    return { active: null, mxc: { ...facts, state: "mxc-check-failed", reason, missing } };
  }

  /** MXC's trust check, unless one already failed in this start of Halonic. */
  async #trustCheck(): Promise<TrustCheckResult> {
    if (this.#mxcFailure !== null) return this.#mxcFailure;
    const result = await runTrustCheck(this.#mxc.sandbox, this.#mxc.canary);
    if (!result.passed) this.#mxcFailure = result;
    return result;
  }
}

function backendOf(backends: readonly SandboxBackend[], id: SandboxBackendId): SandboxBackend {
  const backend = backends.find((candidate) => candidate.id === id);
  if (backend === undefined) throw new Error(`The ${id} sandbox backend is missing.`);
  return backend;
}
