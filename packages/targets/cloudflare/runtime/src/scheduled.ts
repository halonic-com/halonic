import type { Runtime } from "./runtime.ts";

/**
 * What one cron run does: the routine tick, then the watchdog's sweep. They
 * are independent, so a failing tick never stops the sweep and the other way
 * round: a run stuck for good is worse than a missed tick, and the next tick
 * catches up (the `Scheduler` port). Every failure is collected, so the cron
 * run shows as failed in Cloudflare and nothing fails silently.
 *
 * @param at - the ISO time the cron was scheduled for
 * @throws AggregateError when the tick failed or the watchdog couldn't check a run; the message names what failed, never a value
 *
 * @example
 * await runScheduled(runtime, new Date(controller.scheduledTime).toISOString());
 */
export async function runScheduled(
  runtime: Pick<Runtime, "routines" | "watchdog">,
  at: string,
): Promise<void> {
  const failures: Error[] = [];

  try {
    await runtime.routines.tick(at);
  } catch (error) {
    failures.push(new Error("The routine tick failed.", { cause: error }));
  }

  try {
    const report = await runtime.watchdog.sweep();
    for (const { runId, error } of report.failed) {
      failures.push(new Error(`The watchdog couldn't check run ${runId}.`, { cause: error }));
    }
  } catch (error) {
    failures.push(new Error("The watchdog's sweep failed.", { cause: error }));
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, failures.map((failure) => failure.message).join(" "));
  }
}
