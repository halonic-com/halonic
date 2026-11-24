/**
 * A step's harness program is being started (requirement
 * `events.started-events`). `harness` is the agent's harness id, such as
 * `"claude-code"`; `timeoutMs` is how long the engine waits for its first
 * event. `session`: how the harness session began; absent in older logs.
 */
export interface HarnessStartedEvent {
  type: "harness.started";
  state: string;
  agent: string;
  harness: string;
  timeoutMs: number;
  session?: HarnessSessionStart;
}

/**
 * How a step's harness session began (requirement
 * `events.harness-session-start`): `fresh`, with nothing the program kept
 * from an earlier session, or `resumed` from one. `reason` says why, so the
 * run log can count fresh starts by their cause. Halonic doesn't resume a
 * harness session yet, so today every start is `fresh`, for the reason
 * `no-resume`.
 */
export interface HarnessSessionStart {
  start: "fresh" | "resumed";
  reason: "no-resume";
}
