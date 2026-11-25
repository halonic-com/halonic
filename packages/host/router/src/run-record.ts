import { type Infer, s } from "@halonicjs/schema-kit";

/**
 * The parts of a Paperclip run record (`GET /api/heartbeat-runs/:id`) the cost
 * export reads (architecture note section 10 Q2: the run record is the source
 * of truth for cost). Every other field of the record is dropped.
 */

/**
 * The routing stamp the server writes into `contextSnapshot.halonicRouting`
 * when a run starts (HAL-16985, `halonic-com/server` #54), from what it
 * actually gives the run. `variant` is `null` when the router gave no answer.
 */
export const RoutingStamp = s.object({
  v: s.literal(1),
  variant: s.string().nullable(),
  alias: s.string().nullable(),
  tool: s.string().nullable(),
  model: s.string().nullable(),
  effort: s.string().nullable(),
  addOns: s.array(s.string()),
  step: s.string().nullable(),
  /** The router's decision; stamped once the router step at assignment writes it. */
  decisionId: s.string().optional(),
  /** The workflow step this run is, from 0; stamped together with `decisionId`. */
  stepIndex: s.number().int().min(0).optional(),
});

/** Tokens and cost as Paperclip records them for the run. */
const RunUsage = s.object({
  /** `subscription_included` for seat runs, which cost nothing per run. */
  billingType: s.string().nullish(),
  /** The cost the agent tool or provider reported for the run, in US dollars. */
  costUsd: s.number().nullish(),
  /** Input tokens that were not read from the cache. */
  inputTokens: s.number().int().min(0).nullish(),
  cachedInputTokens: s.number().int().min(0).nullish(),
  outputTokens: s.number().int().min(0).nullish(),
});

/** One run as the export reads it. */
export const RunRecord = s.object({
  id: s.string(),
  issueId: s.string().nullable(),
  status: s.string(),
  startedAt: s.string().nullable(),
  finishedAt: s.string().nullable(),
  /**
   * When the agent tool's process started. The server writes the routing stamp
   * before it starts the process, so a run with this set got past the stamp.
   */
  processStartedAt: s.string().nullable(),
  errorCode: s.string().nullable(),
  usageJson: RunUsage.nullable(),
  contextSnapshot: s.object({ halonicRouting: s.unknown().optional() }).nullable(),
});

/** The routing stamp on a run. */
export type RoutingStamp = Infer<typeof RoutingStamp>;
/** A run record, with only the fields the export reads. */
export type RunRecord = Infer<typeof RunRecord>;
