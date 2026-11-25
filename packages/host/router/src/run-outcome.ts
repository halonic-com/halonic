import type { ModelAlias } from "@halonicjs/format";
import { parse } from "@halonicjs/schema-kit";
import type { CatalogEntry, ProviderCatalog } from "./catalog.ts";
import { RoutingStamp, RunRecord } from "./run-record.ts";

/**
 * The cost part of one `route_outcomes` row (architecture note section 6), for
 * one finished, routed run. The store writes each field to the snake_case
 * column of the same name (`decisionId` → `decision_id`). The configuration
 * (tool, effort, add-ons) is not copied: it is looked up through the decision.
 */
export interface RouteOutcomeRow {
  /** `null` until the router step stamps its decision on the run. */
  readonly decisionId: string | null;
  readonly runId: string;
  readonly taskId: string | null;
  /** `null` until the router step stamps it, like `decisionId`. */
  readonly stepIndex: number | null;
  /** The stamp's flow step, such as `first` or `cascade`. */
  readonly step: string | null;
  readonly variantId: string;
  readonly alias: string;
  readonly provider: string;
  readonly pinnedHost: string | null;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly cacheReadTokens: number;
  /** Paperclip's run record doesn't count cache writes, so this stays `null`. */
  readonly cacheWriteTokens: null;
  /** The run at the catalog's list price (Q4), seat runs included. */
  readonly costUsd: number;
  /** What the run cost us: 0 for a seat run, otherwise the reported cost. */
  readonly paidCostUsd: number | null;
  /** The cost the agent tool or provider reported, which the drift check compares. */
  readonly reportedCostUsd: number | null;
  readonly priceVersion: string;
  /** The reported cost is more than 10% away from the list price: the price table may be stale. */
  readonly costDrift: boolean;
  readonly exitCause: string;
  /** `false` for a run that ended because its provider was down (Q3): its cost counts, its result doesn't. */
  readonly trainingEvidence: boolean;
  readonly agentMinutes: number | null;
}

/** Why a run gives no row. */
export type SkipReason =
  /** The record doesn't have the shape the export reads. */
  | "unreadable"
  /** The run hasn't finished; the export reads it again later. */
  | "unfinished"
  /** The run ended before its process started, so any stamp on it came from its wake, not the server. */
  | "not-started"
  /** The run has no routing stamp the export can read. */
  | "unstamped"
  /** The router gave no answer for the run (`variant: null`) or named no alias. */
  | "unrouted"
  /** The stamp names an alias the catalog doesn't have. */
  | "unknown-alias";

/** The export's answer for one run: a row, or why there is none. */
export type RunOutcome =
  | { readonly kind: "row"; readonly row: RouteOutcomeRow }
  | { readonly kind: "skipped"; readonly reason: SkipReason };

/** The status Paperclip gives a run that ended because its provider was down (Q3). */
export const providerDownCause = "provider_down";

/** How far the reported cost may be from the list price before the row is flagged (Q4). */
const driftLimit = 0.1;

/** Prices in the catalog are per million tokens. */
const tokensPerPrice = 1_000_000;

/**
 * Turns one Paperclip run record into its `route_outcomes` cost row, priced
 * with the catalog it gets. Only finished runs that got past the server's
 * routing stamp and were routed give a row; every other run is skipped with
 * its reason, so baseline and broken runs never become training rows.
 *
 * @example
 * const outcome = routeOutcomeOf(await getRun(id), catalog);
 * if (outcome.kind === "row") store.write(outcome.row);
 */
export function routeOutcomeOf(record: unknown, catalog: ProviderCatalog): RunOutcome {
  const run = parse(RunRecord, record);
  if (!run.ok) {
    return skipped("unreadable");
  }
  const { finishedAt, processStartedAt, contextSnapshot } = run.value;
  if (finishedAt === null) {
    return skipped("unfinished");
  }
  if (processStartedAt === null) {
    return skipped("not-started");
  }
  const stamp = parse(RoutingStamp, contextSnapshot?.halonicRouting);
  if (!stamp.ok) {
    return skipped("unstamped");
  }
  const { variant, alias } = stamp.value;
  if (variant === null || alias === null) {
    return skipped("unrouted");
  }
  const entry = catalog.entries.get(alias);
  if (entry === undefined) {
    return skipped("unknown-alias");
  }
  return { kind: "row", row: rowOf(run.value, stamp.value, variant, entry, catalog.priceVersion) };
}

function rowOf(
  run: RunRecord,
  stamp: RoutingStamp,
  variantId: string,
  entry: CatalogEntry,
  priceVersion: string,
): RouteOutcomeRow {
  const usage = run.usageJson;
  const tokens = {
    input: usage?.inputTokens ?? 0,
    cacheRead: usage?.cachedInputTokens ?? 0,
    output: usage?.outputTokens ?? 0,
  };
  const costUsd = listCost(entry.alias, tokens);
  const reportedCostUsd = usage?.costUsd ?? null;
  const exitCause = exitCauseOf(run);
  return {
    decisionId: stamp.decisionId ?? null,
    runId: run.id,
    taskId: run.issueId,
    stepIndex: stamp.stepIndex ?? null,
    step: stamp.step,
    variantId,
    alias: entry.name,
    provider: entry.alias.provider,
    pinnedHost: entry.pinnedHost ?? null,
    tokensIn: tokens.input,
    tokensOut: tokens.output,
    cacheReadTokens: tokens.cacheRead,
    cacheWriteTokens: null,
    costUsd,
    paidCostUsd: usage?.billingType === "subscription_included" ? 0 : reportedCostUsd,
    reportedCostUsd,
    priceVersion,
    costDrift: drifts(costUsd, reportedCostUsd),
    exitCause,
    trainingEvidence: exitCause !== providerDownCause,
    agentMinutes: minutesBetween(run.startedAt, run.finishedAt),
  };
}

/**
 * The run at list price, rounded to a millionth of a dollar. Cached input
 * without a cache price of its own is priced as input.
 */
function listCost(
  alias: ModelAlias,
  tokens: { readonly input: number; readonly cacheRead: number; readonly output: number },
): number {
  const price = alias.price;
  if (price === undefined) {
    return 0;
  }
  const dollars =
    (tokens.input * price.input +
      tokens.cacheRead * (price.cacheRead ?? price.input) +
      tokens.output * price.output) /
    tokensPerPrice;
  return Math.round(dollars * 1_000_000) / 1_000_000;
}

/** Whether the reported cost is more than 10% away from the list price. */
function drifts(listUsd: number, reportedUsd: number | null): boolean {
  if (reportedUsd === null) {
    return false;
  }
  if (listUsd === 0) {
    return reportedUsd > 0;
  }
  return Math.abs(reportedUsd - listUsd) / listUsd > driftLimit;
}

/** `succeeded`, or what ended the run: its error code, else its status. */
function exitCauseOf(run: RunRecord): string {
  return run.status === "succeeded" ? run.status : (run.errorCode ?? run.status);
}

function minutesBetween(start: string | null, end: string | null): number | null {
  if (start === null || end === null) {
    return null;
  }
  const milliseconds = Date.parse(end) - Date.parse(start);
  return Number.isNaN(milliseconds) ? null : Math.round(milliseconds / 600) / 100;
}

function skipped(reason: SkipReason): RunOutcome {
  return { kind: "skipped", reason };
}
