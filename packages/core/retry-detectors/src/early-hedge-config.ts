import { isSameSetup, type WriterSetup } from "./calibration.ts";
import { calibratedOn } from "./coefficients.ts";

/** The early-hedge retry policy's settings for the DeepSeek pilot. */
export interface EarlyHedgeConfig {
  /** The pilot flag. Off by default: writers then run once, as before. */
  readonly enabled: boolean;
  /** An in-run score above this starts the next attempt next to the running one. */
  readonly spawnAbove: number;
  /** An in-run score above this stops the running attempt. */
  readonly stopAbove: number;
  /** The most attempts one writer step may start. */
  readonly maxAttempts: number;
}

/**
 * The defaults from the board's simulation (variant-router REPORT.md
 * "Keep-best and early-hedge"): spawning at 0.4 wasted runs, at 0.7 it lost
 * about 2 points, and a stop between 0.85 and 0.95 barely mattered.
 */
export const defaultEarlyHedgeConfig: EarlyHedgeConfig = {
  enabled: false,
  spawnAbove: 0.5,
  stopAbove: 0.85,
  maxAttempts: 3,
};

/**
 * The policy's settings: the defaults with `overrides` on top.
 *
 * @throws RangeError when a threshold is outside 0 to 1, the stop threshold is
 *   below the spawn threshold, or the attempts aren't a whole number from 1 to 3
 */
export function earlyHedgeConfig(overrides: Partial<EarlyHedgeConfig> = {}): EarlyHedgeConfig {
  const config = { ...defaultEarlyHedgeConfig, ...overrides };
  for (const name of ["spawnAbove", "stopAbove"] as const) {
    const value = config[name];
    if (!(value >= 0 && value <= 1)) {
      throw new RangeError(`${name} must be from 0 to 1, not ${value}.`);
    }
  }
  if (config.stopAbove < config.spawnAbove) {
    throw new RangeError(
      "stopAbove must not be below spawnAbove: a stopped attempt needs a successor.",
    );
  }
  if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1 || config.maxAttempts > 3) {
    throw new RangeError(`maxAttempts must be 1, 2 or 3, not ${config.maxAttempts}.`);
  }
  return config;
}

/**
 * Whether a writer on `setup` runs under the early hedge: only with the pilot
 * flag on, and only on the setup the detectors were fitted on, since a score
 * for any other setup means nothing.
 */
export function hedgeApplies(
  config: EarlyHedgeConfig,
  setup: WriterSetup,
  modelSetup: WriterSetup = calibratedOn,
): boolean {
  return config.enabled && isSameSetup(setup, modelSetup);
}
