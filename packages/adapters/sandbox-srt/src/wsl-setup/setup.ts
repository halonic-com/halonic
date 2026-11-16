import type { SandboxUnavailableReason } from "@halonicjs/ports";
import {
  detectWslProblem,
  EXIT_RESTART_REQUIRED,
  firstLine,
  kernelAtLeast,
  kernelOf,
  parseKernelVersion,
  saysRestartNeeded,
  saysVirtualisationOff,
  WSL_KERNEL_FLOOR,
  type WslProblem,
} from "./detect.ts";
import type { WslHost } from "./host.ts";
import { HALONIC_DISTRO, type WslSetupState, type WslSetupStore } from "./state.ts";

/**
 * What the setup saw in Halonic's distro that it can't close, as codes (W6).
 * Studio words them. They are not `LimitCode`s yet: that list is closed in
 * `core/app` and grows through its own task, with words in the design first.
 *
 * - `default-distro`: `halonic` is the distro `wsl` starts when none is named.
 * - `docker-desktop-visible`: Docker Desktop's socket or `/mnt/wsl/docker-desktop*` shows up in the distro.
 */
export type WslResidual = "default-distro" | "docker-desktop-visible";

/**
 * Why a step failed, apart from the reasons the port names.
 *
 * - `wsl-install-failed`: `wsl --install` ended with an error code.
 * - `import-failed`: `wsl --import` ended with an error code.
 * - `distro-not-ours` (W8): a distro called `halonic` is there that Halonic didn't import. Nothing is overwritten.
 * - `distro-wont-start`: the distro is imported but a program doesn't start in it.
 * - `kernel-too-old` (W11): the WSL kernel is below the floor; `wsl --update` fixes it.
 * - `kernel-unreadable` (W11): `uname -r` in the distro gave no kernel version, so the floor can't be checked.
 */
export type WslSetupFailureCode =
  | "wsl-install-failed"
  | "import-failed"
  | "distro-not-ours"
  | "distro-wont-start"
  | "kernel-too-old"
  | "kernel-unreadable";

/** How a run of the setup ended. Words are never in here: `detail` is for logs and support. */
export type WslSetupResult =
  | { outcome: "done"; residuals: WslResidual[] }
  | { outcome: "restart-needed" }
  | { outcome: "cancelled" }
  | { outcome: "blocked"; reason: WslProblem; detail: string }
  | {
      outcome: "failed";
      code: WslSetupFailureCode;
      reason: SandboxUnavailableReason;
      detail: string;
      /** Set when `updateWsl()` fixes it. */
      fix?: "update-wsl";
    };

/** What {@link WslSetup} is built from. */
export interface WslSetupOptions {
  host: WslHost;
  store: WslSetupStore;
  /** Where Halonic's distro disk goes: a folder under `%LOCALAPPDATA%\Halonic\wsl`. */
  location: string;
  /** The image's `.tar.gz`. */
  rootfs: string;
  /** What `RunOnce` runs after the restart: Studio's own program with its resume flag. */
  resumeCommand: string;
  /** The distro's name; only a test changes it. */
  distro?: string;
  /** The lowest kernel version the check accepts; defaults to {@link WSL_KERNEL_FLOOR}. */
  kernelFloor?: string;
}

/**
 * The saved state machine of the `srt-wsl` setup (HAL-3779, section 5.4):
 * `not-started` → `installing-wsl` (one administrator prompt) → `restart-needed`
 * → `importing-distro` (no administrator) → `checking` → `done`. The state is
 * saved before each step starts, so the next start resumes at that step.
 *
 * It never writes `.wslconfig`, never replaces a distro it didn't import, and
 * never throws for a failed step: the result says how it ended.
 *
 * @example
 * const setup = new WslSetup({ host, store, location, rootfs, resumeCommand });
 * const result = await setup.run(); // `restart-needed`, then after the restart:
 * await setup.run(); // `{ outcome: "done", residuals: [] }`
 */
export class WslSetup {
  readonly #host: WslHost;
  readonly #store: WslSetupStore;
  readonly #options: WslSetupOptions;
  readonly #distro: string;

  constructor(options: WslSetupOptions) {
    this.#host = options.host;
    this.#store = options.store;
    this.#options = options;
    this.#distro = options.distro ?? HALONIC_DISTRO;
  }

  /** The saved step, for Studio to open the onboarding at. */
  async state(): Promise<WslSetupState> {
    return this.#store.load();
  }

  /** Runs the steps from the saved one until one stops or the setup is done. Running again repairs or changes nothing. */
  async run(): Promise<WslSetupResult> {
    let state = await this.#store.load();
    // A finished setup is checked again from the start of what can break.
    if (state.step === "done") state = { ...state, step: "not-started" };
    for (;;) {
      const next = await this.#step(state);
      if ("result" in next) return next.result;
      state = next.state;
      await this.#store.save(state);
    }
  }

  /** The fix for `kernel-too-old` (W11): `wsl --update`. Run {@link run} again after it. */
  async updateWsl(): Promise<{ done: boolean; cancelled: boolean }> {
    const result = await this.#host.updateWsl();
    return { done: !result.cancelled && result.code === 0, cancelled: result.cancelled };
  }

  async #step(
    state: WslSetupState,
  ): Promise<{ state: WslSetupState } | { result: WslSetupResult }> {
    switch (state.step) {
      case "not-started":
      case "installing-wsl":
        return this.#start(state);
      case "restart-needed":
        return this.#afterRestart(state);
      case "importing-distro":
        return this.#importDistro(state);
      case "checking":
        return this.#check(state);
      case "done":
        return { result: { outcome: "done", residuals: [] } };
    }
  }

  /** `not-started` and a step that was interrupted: look at what WSL is, then install, import or check. */
  async #start(state: WslSetupState) {
    const found = await detectWslProblem(this.#host, this.#distro, false);
    switch (found.problem) {
      case "not-supported":
      case "blocked-by-policy":
      case "virtualisation-off":
        return blocked(found.problem, found.detail);
      case "distro-missing":
      case null:
        return { state: { ...state, step: "importing-distro" as const } };
      default:
        return this.#install(state);
    }
  }

  async #install(state: WslSetupState) {
    // Saved before the prompt, with the key that restarts the setup: a restart
    // in the middle of the install must still find its way back.
    await this.#store.save({ ...state, step: "installing-wsl" });
    await this.#host.setRunOnce(this.#options.resumeCommand);
    const install = await this.#host.installWsl();
    if (install.cancelled) {
      await this.#host.clearRunOnce();
      await this.#store.save({ ...state, step: "not-started" });
      return { result: { outcome: "cancelled" } as const };
    }
    if (saysVirtualisationOff(install.output)) {
      await this.#host.clearRunOnce();
      await this.#store.save({ ...state, step: "not-started" });
      return blocked("virtualisation-off", firstLine(install.output));
    }
    const restart = install.code === EXIT_RESTART_REQUIRED || saysRestartNeeded(install.output);
    if (install.code !== 0 && install.code !== EXIT_RESTART_REQUIRED) {
      await this.#host.clearRunOnce();
      return failed(
        "wsl-install-failed",
        "wsl-missing",
        `exit ${install.code}: ${firstLine(install.output)}`,
      );
    }
    const after = await detectWslProblem(this.#host, this.#distro, false);
    if (restart || after.problem === "wsl-missing" || after.problem === "restart-needed") {
      return {
        state: { ...state, step: "restart-needed" as const, bootedAt: await this.#host.bootedAt() },
      };
    }
    await this.#host.clearRunOnce();
    return { state: { ...state, step: "importing-distro" as const } };
  }

  async #afterRestart(state: WslSetupState) {
    // An empty start time means it couldn't be read: unknown, so carry on (the next step asks `wsl --status` again).
    const now = await this.#host.bootedAt();
    if (state.bootedAt !== undefined && state.bootedAt !== "" && state.bootedAt === now) {
      return { result: { outcome: "restart-needed" } as const };
    }
    await this.#host.clearRunOnce();
    const { bootedAt: _gone, ...rest } = state;
    return { state: { ...rest, step: "not-started" as const } };
  }

  async #importDistro(state: WslSetupState) {
    const found = await detectWslProblem(this.#host, this.#distro, false);
    switch (found.problem) {
      case "not-supported":
      case "blocked-by-policy":
      case "virtualisation-off":
        return blocked(found.problem, found.detail);
      case "wsl-missing":
      case "restart-needed":
        return this.#install(state);
      case "distro-missing":
        break;
      case null: {
        // W8: a distro of that name is there. Only one Halonic imported counts.
        return state.importedDistro?.name === this.#distro
          ? { state: { ...state, step: "checking" as const } }
          : failed(
              "distro-not-ours",
              "other",
              `a distro called "${this.#distro}" exists that Halonic didn't import`,
            );
      }
    }
    const imported = await this.#host.importDistro(
      this.#distro,
      this.#options.location,
      this.#options.rootfs,
    );
    if (imported.code !== 0) {
      return failed(
        "import-failed",
        "distro-missing",
        `exit ${imported.code}: ${firstLine(imported.output)}`,
      );
    }
    return {
      state: {
        ...state,
        step: "checking" as const,
        importedDistro: { name: this.#distro, location: this.#options.location },
      },
    };
  }

  /** The distro starts, the kernel is new enough (W11), and nothing leaks in that the person should hear about (W6). */
  async #check(state: WslSetupState) {
    const ours = state.importedDistro?.name === this.#distro;
    const registered = (await this.#host.distros()).find((entry) => entry.name === this.#distro);
    if (registered === undefined) {
      return failed(
        "distro-wont-start",
        "distro-missing",
        `the distro "${this.#distro}" isn't registered`,
      );
    }
    if (!ours) {
      return failed(
        "distro-not-ours",
        "other",
        `a distro called "${this.#distro}" exists that Halonic didn't import`,
      );
    }
    const started = await this.#host.runInDistro(this.#distro, ["true"]);
    if (started.code !== 0) {
      return failed(
        "distro-wont-start",
        "other",
        `exit ${started.code}: ${firstLine(started.output)}`,
      );
    }
    const kernel = kernelOf(await this.#host.runInDistro(this.#distro, ["uname", "-r"]));
    if (kernel === null) {
      return failed(
        "kernel-unreadable",
        "other",
        "uname -r in the distro gave no kernel version",
        "update-wsl",
      );
    }
    const floor = this.#options.kernelFloor ?? WSL_KERNEL_FLOOR;
    const floorParts = parseKernelVersion(floor);
    if (floorParts === null || !kernelAtLeast(kernel, floorParts)) {
      return failed(
        "kernel-too-old",
        "other",
        `kernel ${kernel.join(".")} is below ${floor}`,
        "update-wsl",
      );
    }
    const residuals: WslResidual[] = [];
    if (registered.isDefault) residuals.push("default-distro");
    if (await this.#dockerDesktopVisible()) residuals.push("docker-desktop-visible");
    await this.#host.clearRunOnce();
    await this.#store.save({ ...state, step: "done" });
    return { result: { outcome: "done", residuals } as const };
  }

  /** Whether Docker Desktop's socket or its `/mnt/wsl/docker-desktop*` folders can be seen from inside the distro. */
  async #dockerDesktopVisible(): Promise<boolean> {
    const socket = await this.#host.runInDistro(this.#distro, [
      "test",
      "-S",
      "/var/run/docker.sock",
    ]);
    if (socket.code === 0) return true;
    const listing = await this.#host.runInDistro(this.#distro, ["ls", "-1", "/mnt/wsl"]);
    return listing.code === 0 && /^docker-desktop/m.test(listing.output);
  }
}

function blocked(reason: WslProblem, detail: string) {
  return { result: { outcome: "blocked", reason, detail } as const };
}

function failed(
  code: WslSetupFailureCode,
  reason: SandboxUnavailableReason,
  detail: string,
  fix?: "update-wsl",
) {
  return {
    result: {
      outcome: "failed",
      code,
      reason,
      detail,
      ...(fix === undefined ? {} : { fix }),
    } as const,
  };
}
