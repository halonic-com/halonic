import type { TeamStatus } from "@halonicjs/ports";

/**
 * Calls `listener` whenever a `TeamStatus` source says its team status
 * changed, and returns a function that stops it. A broken change feed ends
 * the watch with its error logged, and the screen keeps its last read.
 * `screen` names the screen in that log line.
 */
export function watchTeamStatus(
  team: TeamStatus | undefined,
  listener: () => void,
  screen: string,
): () => void {
  if (team === undefined) return () => {};
  const changes = team.changes()[Symbol.asyncIterator]();
  let stopped = false;
  const next = (): void => {
    changes.next().then(
      (change) => {
        if (stopped || change.done === true) return;
        listener();
        next();
      },
      (error: unknown) => {
        if (!stopped) console.error(`${screen} stopped hearing changes:`, error);
      },
    );
  };
  next();
  return () => {
    stopped = true;
    void changes.return?.();
  };
}
