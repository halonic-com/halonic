import type { PluginEvent, PluginEventsClient } from "@paperclipai/plugin-sdk";
import { type CompaniesApi, type CompanyRoster, isScopeRefusal } from "./companies.ts";
import { manifest } from "./manifest.ts";

/** The part of the plugin context a scheduled job uses, so tests can fake it. */
export interface ScheduledApi extends CompaniesApi {
  readonly events: Pick<PluginEventsClient, "emit" | "on">;
}

/** A scheduled job that does its work one company at a time, inside that company's scope. */
export interface ScheduledJob {
  /** The job's handler: asks for one pass per company the roster knows. */
  dispatch(): Promise<void>;
  /**
   * Asks for one pass for one company outside the schedule (HAL-18729). If
   * a pass is running, one more runs after it instead of none.
   */
  request(companyId: string): Promise<void>;
}

/**
 * Runs a job's work for each company inside a call the host scopes to that
 * company (HAL-16941).
 *
 * A job run carries no invocation scope, so while any other call of the
 * plugin is in flight the host refuses each of the job's calls that names
 * no company, such as GitHub requests (`http.fetch`) and metrics. So the job
 * only emits the plugin's own event `<name>` once per company; the emit
 * names its company, which the host admits. The host then delivers that
 * event back as a call scoped to the company, and the pass runs there, so
 * every host call it makes carries that scope.
 *
 * A pass still running when the next one is asked for is not started twice.
 * A `request` that finds a pass running gets one more pass after it, since
 * the running one may have read the facts before the event behind it.
 */
export function scheduledPerCompany(
  ctx: ScheduledApi,
  roster: CompanyRoster,
  name: string,
  pass: (companyId: string, now: Date) => Promise<void>,
): ScheduledJob {
  const running = new Set<string>();
  const again = new Set<string>();
  ctx.events.on(`plugin.${manifest.id}.${name}`, async (event: PluginEvent) => {
    const { companyId } = event;
    if (running.has(companyId)) {
      const followUp = (event.payload as { followUp?: unknown } | null)?.followUp === true;
      if (followUp) {
        again.add(companyId);
      }
      const then = followUp ? "one more runs after it" : "skipped";
      ctx.logger.info(`${name}: the last pass is still running, ${then}.`, { companyId });
      return;
    }
    running.add(companyId);
    try {
      do {
        again.delete(companyId);
        try {
          await pass(companyId, new Date());
        } catch (error) {
          ctx.logger.error(`${name}: ${(error as Error).message}`, { companyId });
        }
      } while (again.has(companyId));
    } finally {
      running.delete(companyId);
    }
  });
  return {
    async request(companyId) {
      await ctx.events.emit(name, companyId, { followUp: true });
    },
    async dispatch() {
      let failed = 0;
      for (const companyId of await roster.ids(ctx)) {
        try {
          await ctx.events.emit(name, companyId, {});
        } catch (error) {
          if (isScopeRefusal(error)) {
            // A company the plugin has no settings for: the host never lets a job act there.
            ctx.logger.info(`${name}: not set up for this company, skipped.`, { companyId });
            continue;
          }
          failed += 1;
          ctx.logger.error(`${name}: couldn't start a pass: ${(error as Error).message}`, {
            companyId,
          });
        }
      }
      if (failed > 0) {
        throw new Error(`${name}: ${failed} companies couldn't start a pass; see the log.`);
      }
    },
  };
}
