import type { RunEventBody } from "@halonicjs/events";

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
      | "tool.refused";
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
