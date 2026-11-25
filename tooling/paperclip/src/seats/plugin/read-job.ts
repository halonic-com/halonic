import {
  PLUGIN_RPC_ERROR_CODES,
  type PluginCompaniesClient,
  type PluginConfigClient,
  type PluginLogger,
  type PluginStateClient,
  type ScopeKey,
} from "@paperclipai/plugin-sdk";
import type { SeatReadStatus, SeatsReader } from "./seats-reader.ts";
import { readSeatsSettings, type SeatsSettings } from "./settings.ts";

/** The part of the plugin context `seats.read` uses, so tests can fake it. */
export interface ReadJobApi {
  readonly companies: Pick<PluginCompaniesClient, "list">;
  readonly config: PluginConfigClient;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

/** What `seats.read` needs beyond the shared part: it stores each seat's read status. */
export interface SeatsReadJobApi extends ReadJobApi {
  readonly state: Pick<PluginStateClient, "set">;
}

/**
 * One seat's read status as stored for read-only views such as Grafana's
 * sign-in expiry panel. Seat ids only: no account, folder or connection id.
 */
export interface StoredSeatStatus {
  readonly seatId: string;
  /** ISO time the sign-in expires, or null when Claude Code did not say. */
  readonly signInExpiresAt: string | null;
  readonly lastReadAt: string | null;
  readonly alerts: readonly string[];
}

/** Where `seats.read` keeps the newest status of every seat: plugin state holds only the latest values. */
export function seatsReadStatusKey(companyId: string): ScopeKey {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "seats-read",
    stateKey: "status",
  };
}

export function storedSeatStatus(status: SeatReadStatus): StoredSeatStatus {
  return {
    seatId: status.seatId,
    signInExpiresAt: status.signInExpiresAt ?? null,
    lastReadAt: status.lastReadAt ?? null,
    alerts: status.alerts,
  };
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
 * After each round it stores every seat's status under `seatsReadStatusKey`.
 */
export async function runSeatsRead(ctx: SeatsReadJobApi, reader: SeatsReader): Promise<void> {
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
  const statuses = reader.status(owner.settings.seats).map(storedSeatStatus);
  await ctx.state.set(seatsReadStatusKey(owner.companyId), statuses);
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
