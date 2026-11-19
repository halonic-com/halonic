import type { RunEventBody } from "@halonicjs/events";
import { connectorStartCause } from "./connector-start-cause.ts";

/** The run log events a model turn writes, with the `agent.*` events of the subagents it hands tasks to. */
export type TurnEvent = Extract<
  RunEventBody,
  {
    type:
      | "agent.started"
      | "agent.finished"
      | "llm.request"
      | "llm.response"
      | "llm.skipped"
      | "llm.fallback"
      | "knowledge.searched"
      | "tool.called"
      | "tool.result"
      | "tool.refused"
      | "tool.unasked"
      | "connector.listing-failed";
  }
>;

/**
 * Where a model turn writes its events: the run log of the run it belongs
 * to. A chat turn outside any run has none, so it keeps no log.
 */
export interface TurnLog {
  /**
   * Appends one event, in the order the turn writes them.
   *
   * @throws when the event can't be stored; the turn stops there
   */
  append(event: TurnEvent): Promise<void>;
}

/**
 * Writes a `connector.listing-failed` for each connector whose tools the
 * turn couldn't list (requirement `engine.connector-listing-failed`), so a run's
 * log says why its tools were missing. The model hears it from the turn's
 * refusals; a person reads it here. `listingErrors` is the turn's
 * (`TurnTools.listingErrors`), by connector id. A turn with no log writes nothing.
 */
export async function logListingFailures(
  log: TurnLog | undefined,
  agent: string,
  listingErrors: ReadonlyMap<string, unknown>,
): Promise<void> {
  if (log === undefined) return;
  for (const [connector, error] of listingErrors) {
    const cause = connectorStartCause(error);
    await log.append({ type: "connector.listing-failed", agent, connector, cause });
  }
}
