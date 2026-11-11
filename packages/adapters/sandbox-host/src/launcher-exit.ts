// A program the launcher starts gets its own process group, so Ctrl-C on the
// launcher no longer reaches it. Everything still running is stopped here on
// the way out instead: when the launcher exits, or gets SIGINT or SIGTERM.

/** Stops one program the launcher started, and what it started. Must not throw. */
export type StopOnExit = () => void;

const running = new Set<StopOnExit>();

function stopAll(): void {
  for (const stop of running) stop();
  running.clear();
}

const onSigint = () => onLauncherSignal("SIGINT");
const onSigterm = () => onLauncherSignal("SIGTERM");

function onLauncherSignal(signal: NodeJS.Signals): void {
  stopAll();
  unwatchLauncher();
  // With no other listener the signal would have ended the launcher, so let it. With one, that
  // listener has this signal already and re-raising would show it a second Ctrl-C.
  if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
}

function watchLauncher(): void {
  process.on("exit", stopAll);
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);
}

function unwatchLauncher(): void {
  process.off("exit", stopAll);
  process.off("SIGINT", onSigint);
  process.off("SIGTERM", onSigterm);
}

/**
 * Stops `stop`'s program when the launcher exits or gets SIGINT or SIGTERM.
 * Call it before the program starts: a signal that came before the handlers
 * would end the launcher and leave the program running. Call the returned
 * function once the program has ended.
 */
export function stopOnLauncherExit(stop: StopOnExit): () => void {
  if (running.size === 0) watchLauncher();
  running.add(stop);
  return () => {
    if (!running.delete(stop)) return;
    if (running.size === 0) unwatchLauncher();
  };
}
