import {
  PLUGIN_RPC_ERROR_CODES,
  type PluginCompaniesClient,
  type PluginConfigClient,
  type PluginLogger,
} from "@paperclipai/plugin-sdk";
import type { SeatsReader } from "./seats-reader.ts";
import { readSeatsSettings, type SeatsSettings } from "./settings.ts";

/** The part of the plugin context `seats.read` uses, so tests can fake it. */
export interface ReadJobApi {
  readonly companies: Pick<PluginCompaniesClient, "list">;
  readonly config: PluginConfigClient;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

/** The company whose settings hold the seats, and those settings. */
export interface SeatsOwner {
  readonly companyId: string;
  readonly settings: SeatsSettings;
}

/**
 * Finds the company whose settings list the seats. The seat folders are on
 * the server, and the stored history has no company column, so one company
 * holds them. If several list seats, only the first is read, so no seat
 * folder is ever read twice, and the job logs it for the board to fix.
 */
export async function seatsOwner(ctx: ReadJobApi): Promise<SeatsOwner | undefined> {
  const owners: SeatsOwner[] = [];
  for (const company of await ctx.companies.list()) {
    const settings = await companySettings(ctx, company.id);
    if (settings !== undefined && settings.seats.length > 0) {
      owners.push({ companyId: company.id, settings });
    }
  }
  const [first, ...others] = owners;
  if (first !== undefined && others.length > 0) {
    ctx.logger.error(
      `seats.read: ${owners.length} companies list seats; only the first is read. Keep the seats in one company's settings.`,
      { companyId: first.companyId },
    );
  }
  return first;
}

/**
 * The `seats.read` job, every minute: reads the seats that are due. It logs
 * counts and error kinds only, never a folder, an account or program output.
 */
export async function runSeatsRead(ctx: ReadJobApi, reader: SeatsReader): Promise<void> {
  const owner = await seatsOwner(ctx);
  if (owner === undefined) {
    return;
  }
  const result = await reader.tick(owner.settings.seats);
  if (result.skipped) {
    ctx.logger.info("seats.read: the last round is still reading, skipped.", {
      companyId: owner.companyId,
    });
    return;
  }
  if (result.read > 0) {
    const errors = result.errors.length > 0 ? ` (${result.errors.join(", ")})` : "";
    ctx.logger.info(
      `seats.read: ${result.read} seats read, ${result.errors.length} without a reading${errors}.`,
      { companyId: owner.companyId },
    );
  }
}

/**
 * Reads a company's settings, or undefined when the board saved none for it:
 * a scheduled job may read only the companies that have saved settings.
 */
async function companySettings(
  ctx: ReadJobApi,
  companyId: string,
): Promise<SeatsSettings | undefined> {
  try {
    return readSeatsSettings(await ctx.config.get(companyId));
  } catch (error) {
    if ((error as { code?: unknown }).code === PLUGIN_RPC_ERROR_CODES.INVOCATION_SCOPE_DENIED) {
      return undefined;
    }
    throw error;
  }
}
