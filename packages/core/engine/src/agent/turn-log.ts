import type { RunEventBody } from "@halonicjs/events";

/** The run log events a model turn writes. */
export type TurnEvent = Extract<
  RunEventBody,
  {
    type:
      | "llm.request"
      | "llm.response"
      | "llm.skipped"
      | "llm.fallback"
      | "tool.called"
      | "tool.result";
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
