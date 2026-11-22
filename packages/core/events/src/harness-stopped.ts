/**
 * A step's harness program had given its result but didn't exit within
 * `afterMs`, so Halonic stopped it, and everything it started, and kept the
 * result (requirement `events.harness-stopped`). The step goes on as if the
 * program had exited. `harness`: the agent's harness id, such as
 * `"claude-code"`. `reason`: today only `no-exit-after-result`.
 */
export interface HarnessStoppedEvent {
  type: "harness.stopped";
  state: string;
  agent: string;
  harness: string;
  reason: "no-exit-after-result";
  afterMs: number;
}
