import type { TauriIpc } from "@halonicjs/studio-services";
import type {
  KeyboardPlatform,
  LiteCheckResult,
  StartReport,
  WelcomeStart,
} from "@halonicjs/studio-shell";

/** How often Welcome asks the window how far the start has got: it only reads (Owen, HAL-13408). */
export const startPollMs = 1_000;

/**
 * How many `start_status` calls in a row may fail before the start reads as ready: one failed call
 * can be a passing hiccup, and shouldn't end the watch (Liam on #4253).
 */
export const startMissesAllowed = 2;

/** The timers the watch waits with; a test passes its own. */
export interface StartTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemStartTimers: StartTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout> | undefined);
  },
};

/** A {@link WelcomeStart} the desktop app stops when its window closes. */
export interface StartWatch extends WelcomeStart {
  stop(): void;
}

/** The systems' names in the report. */
const systemNames: Readonly<Record<KeyboardPlatform, string>> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
};

/**
 * What Welcome shows when the window can't say how the start goes, such as a shell without
 * `start_status`: ready, so Welcome is never held up by the watch itself.
 */
const cantTell: StartReport = {
  state: "ready",
  phase: "host_started",
  cause: null,
  exitCode: null,
  seconds: 0,
};

/** Whether the window's answer has the shape `start_status` promises. */
function isStartReport(answer: unknown): answer is StartReport {
  if (typeof answer !== "object" || answer === null) return false;
  const { state, seconds } = answer as Record<string, unknown>;
  return typeof state === "string" && typeof seconds === "number";
}

/**
 * Halonic's start for Welcome (`studio.start-watch`, first-run-progress 3.2): it tells the window
 * the page is ready (`engine_ready`), which starts the agent host, then asks `start_status` once
 * a second until the start is ready. A failed start is asked on too, because a host that starts
 * late still turns it ready. **Try again** is a new `engine_ready`; **Check this computer** is
 * the window's `lite_check`. When the window can't answer twice in a row, or answers something
 * else, the start reads as ready and the watch stops asking.
 *
 * In 0.1 the engine runs in the page, so the page is ready to work as soon as it runs; the watch
 * starts with the desktop app.
 *
 * @example
 * const start = watchStart(ipc, "windows", "0.1.0");
 * // ... later, when the window closes:
 * start.stop();
 */
export function watchStart(
  ipc: TauriIpc,
  platform: KeyboardPlatform,
  version: string,
  timers: StartTimers = systemStartTimers,
): StartWatch {
  const listeners = new Set<() => void>();
  let report: StartReport | undefined;
  let timer: unknown;
  /** Counts the tries; an answer to an older try, or after `stop`, is dropped. */
  let round = 0;
  /** The `start_status` calls that failed in a row. */
  let misses = 0;

  const askAgain = (mine: number) => {
    timer = timers.setTimeout(() => void ask(mine), startPollMs);
  };
  const ask = async (mine: number) => {
    let answer: unknown;
    let failed = false;
    try {
      answer = await ipc.invoke("start_status");
    } catch (error) {
      failed = true;
      console.warn("Halonic can't read how its start goes.", error);
    }
    if (mine !== round) return;
    misses = failed ? misses + 1 : 0;
    if (failed && misses < startMissesAllowed) {
      askAgain(mine);
      return;
    }
    report = isStartReport(answer) ? answer : cantTell;
    for (const listener of listeners) listener();
    if (report.state !== "ready") {
      askAgain(mine);
    }
  };
  const begin = async () => {
    const mine = ++round;
    misses = 0;
    timers.clearTimeout(timer);
    try {
      await ipc.invoke("engine_ready");
    } catch (error) {
      console.warn("Halonic can't tell the window its page is ready.", error);
    }
    await ask(mine);
  };
  void begin();

  return {
    get report() {
      return report;
    },
    about: `Halonic ${version} · ${systemNames[platform]}`,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    tryAgain: begin,
    async check() {
      return (await ipc.invoke("lite_check")) as readonly LiteCheckResult[];
    },
    stop() {
      round += 1;
      timers.clearTimeout(timer);
      listeners.clear();
    },
  };
}
