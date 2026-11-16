// The saved state of the `srt-wsl` setup (HAL-3779, section 5.4, HAL-5394).

/**
 * Every step of the WSL setup, in order. The list is closed.
 *
 * - `not-started`: nothing done yet.
 * - `installing-wsl`: `wsl --install --no-distribution --web-download` runs, with one administrator prompt.
 * - `restart-needed`: WSL is installed and Windows must restart before the next step.
 * - `importing-distro`: `wsl --import` of Halonic's distro (no administrator).
 * - `checking`: the distro starts, its kernel is new enough and nothing leaks into it.
 * - `done`: the setup is finished.
 */
export const wslSetupSteps = [
  "not-started",
  "installing-wsl",
  "restart-needed",
  "importing-distro",
  "checking",
  "done",
] as const;

/** A step of the WSL setup: one of {@link wslSetupSteps}. */
export type WslSetupStep = (typeof wslSetupSteps)[number];

/** The name of Halonic's own WSL distro. */
export const HALONIC_DISTRO = "halonic";

/**
 * What Studio saves after every step, in its own data (never in a workspace).
 *
 * @example
 * const fresh: WslSetupState = { step: "not-started" };
 */
export interface WslSetupState {
  step: WslSetupStep;
  /**
   * Windows' last start time as the install ended, set with `restart-needed`.
   * Windows has restarted once its start time is a different one.
   */
  bootedAt?: string;
  /** Set once Halonic itself imported the distro: the only distro of that name it will ever replace or trust (W8). */
  importedDistro?: { name: string; location: string };
}

/** Where the setup keeps its state. Studio gives a file in its data folder, a test gives memory. */
export interface WslSetupStore {
  /** The saved state, or `not-started` when nothing is saved. A saved state that can't be read is an error. */
  load(): Promise<WslSetupState>;
  /** Saves `state` whole, before the next step starts. */
  save(state: WslSetupState): Promise<void>;
}

/** A store in memory, for tests and for a host that has no data folder yet. */
export function memoryWslSetupStore(
  initial: WslSetupState = { step: "not-started" },
): WslSetupStore {
  let current: WslSetupState = structuredClone(initial);
  return {
    load: async () => structuredClone(current),
    save: async (state) => {
      current = structuredClone(state);
    },
  };
}
