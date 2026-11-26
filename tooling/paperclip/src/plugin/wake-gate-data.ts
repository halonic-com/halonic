import { loadSnapshot } from "../snapshot/store.ts";
import { freshLines } from "../state-packet/fresh-store.ts";
import { type GateDeps, type GateReport, gateReport } from "../wake-gate/gate.ts";
import { writeMetrics } from "./metrics.ts";
import { type StatePacketApi, statePacketDeps } from "./state-packet-data.ts";

/**
 * The wake gate on the state packet's data key (HAL-18985). The server asks
 * the key just before a monitor wake's run starts, so that is where the gate
 * sees each wake. In `measure` mode it logs and counts what it would have
 * skipped; the answer to the server never changes, so the run always starts.
 */

/** The gate's reads on top of the plugin context. */
export function wakeGateDeps(ctx: StatePacketApi): GateDeps {
  const packet = statePacketDeps(ctx);
  return {
    snapshot: (companyId) => loadSnapshot(ctx, companyId),
    fresh: freshLines(ctx),
    github: packet.github,
    now: packet.now,
    mode: async (companyId) =>
      (await ctx.config.get(companyId))["wakeGate"] === "measure" ? "measure" : "off",
    task: async (issueId, companyId) => {
      const issue = await ctx.issues.get(issueId, companyId);
      return issue?.identifier == null
        ? undefined
        : { identifier: issue.identifier, assigneeAgentId: issue.assigneeAgentId ?? null };
    },
    newestCommentBy: async (issueId, companyId) => {
      const comments = await ctx.issues.listComments(issueId, companyId);
      const newest = [...comments].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];
      return newest === undefined ? undefined : newest.authorAgentId;
    },
  };
}

/** The log line for a report. */
export function reportLine(issueId: string, report: GateReport): string {
  if (report.verdict === undefined) {
    return `Wake gate (measure only): no verdict for ${report.task ?? issueId}: ${report.reason}`;
  }
  const what = report.verdict.kind === "skip" ? "would skip" : "would run";
  return `Wake gate (measure only): ${what} ${report.task}: ${report.verdict.why}`;
}

/** Works out, logs and counts one wake's verdict. It never throws and never changes the wake. */
export async function measureWakeGate(
  ctx: StatePacketApi,
  params: Record<string, unknown>,
  deps: GateDeps = wakeGateDeps(ctx),
): Promise<GateReport | undefined> {
  const { companyId, issueId, wakeReason } = params;
  if (
    typeof companyId !== "string" ||
    typeof issueId !== "string" ||
    typeof wakeReason !== "string"
  ) {
    return undefined;
  }
  const report = await gateReport({ companyId, issueId, wakeReason }, deps);
  if (report === undefined) {
    return undefined;
  }
  ctx.logger.info(reportLine(issueId, report), { companyId, issueId, task: report.task ?? null });
  const metric =
    report.verdict === undefined ? "wake_gate.undecided" : `wake_gate.would_${report.verdict.kind}`;
  await writeMetrics(ctx, { [metric]: 1 }, { companyId });
  return report;
}
