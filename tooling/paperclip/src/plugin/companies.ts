import {
  PLUGIN_RPC_ERROR_CODES,
  type PluginCompaniesClient,
  type PluginLogger,
} from "@paperclipai/plugin-sdk";

/** The part of the plugin context the company lookups use, so tests can fake it. */
export interface CompaniesApi {
  readonly companies: Pick<PluginCompaniesClient, "list">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

/** Where a pass gets the companies it runs for. */
export type CompanySource = (ctx: CompaniesApi) => Promise<readonly string[]>;

/** Every company the host lists. Works only outside a busy worker; see `companyRoster`. */
export const listedCompanies: CompanySource = async (ctx) =>
  (await ctx.companies.list()).map((company) => company.id);

/** Whether the host refused a call for its invocation scope. */
export function isScopeRefusal(error: unknown): boolean {
  return (error as { code?: unknown }).code === PLUGIN_RPC_ERROR_CODES.INVOCATION_SCOPE_DENIED;
}

/**
 * The companies the scheduled jobs dispatch to (HAL-16941).
 *
 * A job runs outside any company, so the host treats its calls as
 * proactive, and refuses one that names no company, such as
 * `companies.list`, while any other call of this plugin is in flight. Each
 * event the plugin receives counts as in flight for 15 minutes on the host
 * (Paperclip 2026.1117.0), so since 0.3.0 subscribes to events that is
 * nearly always. The roster therefore learns its companies from the scoped
 * calls themselves (events, the gh-guard route) and adds the host's list
 * whenever the host answers it.
 */
export interface CompanyRoster {
  /** Notes the company a scoped call came from. */
  remember(companyId: string): void;
  /** Every company seen so far, plus the host's list when it answers. */
  ids(ctx: CompaniesApi): Promise<string[]>;
}

/** A roster for one plugin worker, kept in memory for the worker's life. */
export function companyRoster(): CompanyRoster {
  const seen = new Set<string>();
  return {
    remember(companyId) {
      if (companyId !== "") {
        seen.add(companyId);
      }
    },
    async ids(ctx) {
      try {
        for (const companyId of await listedCompanies(ctx)) {
          seen.add(companyId);
        }
      } catch (error) {
        if (!isScopeRefusal(error)) {
          throw error;
        }
        // Expected while another call is in flight: the companies seen so far still run.
        ctx.logger.info(
          `Jobs: the host didn't list the companies while busy; using the ${seen.size} seen so far.`,
        );
      }
      return [...seen];
    },
  };
}
