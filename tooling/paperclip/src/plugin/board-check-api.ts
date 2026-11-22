import type {
  PluginAgentsClient,
  PluginCompaniesClient,
  PluginConfigClient,
  PluginIssueRelationsClient,
  PluginIssuesClient,
  PluginLogger,
  PluginStateClient,
} from "@paperclipai/plugin-sdk";
import type { BoardWrite, BoardWriteApi } from "../board-check/writes.ts";
import type { MetricsApi } from "./metrics.ts";

/**
 * What the board check's parts share: the slice of the plugin context they
 * may use, and the shape of a part's plan. Reads only, apart from the write
 * calls the gate (`../board-check/writes.ts`) sends.
 */

/** The part of the plugin context the board check uses, so tests can fake it. */
export interface BoardCheckApi extends MetricsApi {
  readonly issues: BoardWriteApi["issues"] &
    Pick<PluginIssuesClient, "list" | "get" | "listComments" | "listInteractions"> & {
      readonly relations: Pick<PluginIssueRelationsClient, "get">;
    };
  readonly agents: Pick<PluginAgentsClient, "list">;
  readonly state: Pick<PluginStateClient, "get" | "set">;
  readonly config: PluginConfigClient;
  readonly companies: Pick<PluginCompaniesClient, "list">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

/** What one part of a pass wants written, and what it saves once the gate let the pass through. */
export interface PartPlan {
  readonly writes: readonly BoardWrite[];
  /**
   * Saves the part's state. `sent` holds the writes that actually went out:
   * with the switch off they are only logged, and a part that reports a
   * state rather than an event must not count a logged write as reported.
   */
  readonly save: (sent: ReadonlySet<BoardWrite>) => Promise<void>;
}

/** What started a pass: a Paperclip event or the 10-minute job. */
export type Trigger = "event" | "job";

/** Where the board check keeps `key` for a company in plugin state. */
export const stateKey = (companyId: string, key: "asks" | "failed-runs" | "waiting") =>
  ({
    scopeKind: "company",
    scopeId: companyId,
    namespace: "board-check",
    stateKey: key,
  }) as const;

/** An error's code or name for the log; its message may quote what it failed on. */
export function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" || typeof code === "number"
    ? String(code)
    : ((error as Error | null)?.name ?? "Error");
}
