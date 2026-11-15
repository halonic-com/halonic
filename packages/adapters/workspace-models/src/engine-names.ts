// What the engines of one workspace share by name (HAL-10236): the CLI's
// engine and the Studio's keep the run timers and the routine scheduler's
// state in the same collections, and hold the same lock file, so each one
// finds what the other left.

/** The collection of the workspace's record store that keeps the run timers. */
export const runTimerCollection = "halonic.run-timers";

/** The collection of the workspace's record store that keeps what the routine scheduler shares between ticks. */
export const routineStateCollection = "halonic.routine-state";

/** The file in the workspace's folder in the profile that the one engine on it holds. */
export const engineLockFile = "engine.lock";
