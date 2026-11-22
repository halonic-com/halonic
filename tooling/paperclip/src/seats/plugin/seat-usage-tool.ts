import type {
  PluginConfigClient,
  PluginLogger,
  PluginToolsClient,
  ToolResult,
  ToolRunContext,
} from "@paperclipai/plugin-sdk";
import type { AgentId } from "../records.ts";
import { manifest } from "./manifest.ts";
import { seatUsage, seatUsageText } from "./seat-usage.ts";
import type { SeatReadStatus } from "./seats-reader.ts";
import { readSeatsSettings, type SeatSetting } from "./settings.ts";
import type { StoredReadings } from "./stored-readings.ts";

/** The part of the plugin context the tool uses, so tests can fake it. */
export interface SeatUsageToolApi {
  readonly tools: Pick<PluginToolsClient, "register">;
  readonly config: PluginConfigClient;
  readonly logger: Pick<PluginLogger, "error">;
}

/** Where the answer comes from: the stored readings and `seats.read`'s memory, never a seat. */
export interface SeatUsageSources {
  readonly stored: StoredReadings;
  readonly statuses: (seats: readonly SeatSetting[]) => readonly SeatReadStatus[];
  readonly now: () => Date;
}

/**
 * The agents the board lets call `seat_usage` (HAL-16192: the Seat
 * Supervisor and Chief). Empty until the board fills it in, so nobody can.
 */
export function readSeatUsageCallers(config: Readonly<Record<string, unknown>>): AgentId[] {
  const entries = Array.isArray(config["seatUsageAgents"]) ? config["seatUsageAgents"] : [];
  return entries.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

/** Registers `seat_usage` as the manifest declares it. */
export function registerSeatUsageTool(ctx: SeatUsageToolApi, sources: SeatUsageSources): void {
  const declaration = manifest.tools?.find((tool) => tool.name === "seat_usage");
  if (declaration === undefined) {
    throw new Error("AI seats: the manifest doesn't declare seat_usage.");
  }
  ctx.tools.register("seat_usage", declaration, (_params, runCtx) =>
    answerSeatUsage(ctx, sources, runCtx),
  );
}

async function answerSeatUsage(
  ctx: SeatUsageToolApi,
  sources: SeatUsageSources,
  runCtx: ToolRunContext,
): Promise<ToolResult> {
  const config = await ctx.config.get(runCtx.companyId);
  if (!readSeatUsageCallers(config).includes(runCtx.agentId)) {
    return {
      error:
        "seat_usage: only the agents the board lists in the AI seats plugin's settings may call it.",
    };
  }
  const { seats } = readSeatsSettings(config);
  try {
    const stored = seats.length === 0 ? [] : await sources.stored.latest();
    const usage = seatUsage(seats, stored, sources.statuses(seats), sources.now());
    return { content: seatUsageText(usage), data: { seats: usage } };
  } catch (error) {
    // The database's message goes to the plugin's log, not to the agent.
    ctx.logger.error(
      `seat_usage: reading the stored readings failed: ${(error as Error).message}`,
      {
        companyId: runCtx.companyId,
      },
    );
    return {
      error:
        "seat_usage: the stored readings couldn't be read; the board can see why in the plugin's log.",
    };
  }
}
