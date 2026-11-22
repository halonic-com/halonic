import type { PluginEvent } from "@paperclipai/plugin-sdk";
import {
  planFailedRuns,
  readFailedRun,
  readRecord,
  recordFailure,
} from "../board-check/failed-runs.ts";
import { type BoardCheckApi, type PartPlan, stateKey } from "./board-check-api.ts";

/**
 * The board check's failed-runs part (a). Each `agent.run.failed` event is
 * kept in plugin state as ids and a cause code; the 10-minute pass then
 * wakes the task of a run without a GitHub identity, once per task, and
 * reports new spend-limit failures on the Seat Supervisor's task.
 */

/** Keeps one failed run; its error text is sorted into a cause code and dropped here. */
export async function recordFailedRun(
  ctx: BoardCheckApi,
  event: PluginEvent,
  now: Date,
): Promise<void> {
  const run = readFailedRun(event);
  if (run === undefined) {
    ctx.logger.info("Board check: a failed-run event without a run or an agent, skipped.", {
      companyId: event.companyId,
    });
    return;
  }
  const key = stateKey(event.companyId, "failed-runs");
  const record = readRecord(await ctx.state.get(key));
  await ctx.state.set(key, recordFailure(record, run, now));
}

/** Plans part (a)'s wakes, at most `wakes` of them, and its spend-limit line. */
export async function planRuns(
  ctx: BoardCheckApi,
  companyId: string,
  seatSupervisorTaskId: string | undefined,
  wakes: number,
): Promise<PartPlan> {
  const key = stateKey(companyId, "failed-runs");
  const record = readRecord(await ctx.state.get(key));
  const agents = await ctx.agents.list({ companyId, limit: 500 });
  const plan = planFailedRuns(record, {
    wakes,
    seatSupervisorTaskId,
    names: new Map(agents.map((agent) => [agent.id, agent.name])),
  });
  return { writes: plan.writes, save: () => ctx.state.set(key, plan.record) };
}
