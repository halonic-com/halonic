import type { PluginStateClient } from "@paperclipai/plugin-sdk";
import { dedupeModeOf, lineMarks, type MonitorCheck } from "../pr-watcher/monitor-dedupe.ts";
import {
  buildTimeoutMs,
  type LineDeps,
  monitorWakeReason,
  taskLines,
  timeout,
} from "../state-packet/build.ts";
import { type StatePacketApi, statePacketDeps } from "./state-packet-data.ts";

/**
 * The monitor checks the PR watcher compares against (HAL-20175). The
 * server asks the state packet's data key just before each monitor wake's
 * run starts, so that is where the plugin sees what the run will see: it
 * keeps each open pull request's head and `ci-ok` per task. The watcher
 * moves the author's next short check when nothing changed since.
 */

/** The stored shape's version; another version is ignored, as if nothing were kept. */
const checkVersion = 1;

function key(companyId: string, task: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "monitors",
    stateKey: `monitor-check:${task}`,
  } as const;
}

/** A company's kept monitor checks in plugin state, by task identifier. */
export function monitorChecks(
  ctx: { readonly state: Pick<PluginStateClient, "get" | "set"> },
  companyId: string,
) {
  return {
    get: async (task: string): Promise<MonitorCheck | undefined> => {
      const stored = (await ctx.state.get(key(companyId, task))) as {
        version?: unknown;
        check?: MonitorCheck;
      } | null;
      return stored?.version === checkVersion ? stored.check : undefined;
    },
    set: async (task: string, check: MonitorCheck): Promise<void> => {
      await ctx.state.set(key(companyId, task), { version: checkVersion, check });
    },
  };
}

async function keep(
  ctx: StatePacketApi,
  companyId: string,
  issueId: string,
  deps: LineDeps,
): Promise<MonitorCheck | undefined> {
  if (dedupeModeOf(await ctx.config.get(companyId)) === "off") {
    return undefined;
  }
  const task = (await ctx.issues.get(issueId, companyId))?.identifier;
  if (task == null) {
    return undefined;
  }
  const read = await taskLines(companyId, task, deps);
  if (read.lines === null) {
    return undefined;
  }
  const check: MonitorCheck = { at: deps.now().toISOString(), marks: lineMarks(read.lines) };
  await monitorChecks(ctx, companyId).set(task, check);
  return check;
}

/** Keeps what one monitor wake saw. It never throws; a failure is logged and keeps nothing. */
export async function keepMonitorCheck(
  ctx: StatePacketApi,
  params: Record<string, unknown>,
  deps: LineDeps = statePacketDeps(ctx),
): Promise<MonitorCheck | undefined> {
  const { companyId, issueId, wakeReason } = params;
  if (
    typeof companyId !== "string" ||
    typeof issueId !== "string" ||
    wakeReason !== monitorWakeReason
  ) {
    return undefined;
  }
  try {
    return await Promise.race([keep(ctx, companyId, issueId, deps), timeout(buildTimeoutMs)]);
  } catch (error) {
    ctx.logger.info(
      `Monitor dedupe: couldn't keep the check of ${issueId}: ${(error as Error).message}`,
      { companyId, issueId },
    );
    return undefined;
  }
}
