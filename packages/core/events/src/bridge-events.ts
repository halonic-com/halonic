// The run log's events the harness bridge writes itself, besides the model
// and tool calls it passes through.

/**
 * A request of the agent's program to the harness bridge failed for a reason
 * the bridge didn't name to the program, which was told the run log has the
 * details (requirement `events.bridge-failed`). `kind`: the error kind of
 * `@halonicjs/std`, such as `internal`. `message`: the error's own text,
 * never holding the run token. It never counts towards a budget.
 */
export interface BridgeFailedEvent {
  type: "bridge.failed";
  agent: string;
  kind: string;
  message: string;
}

/**
 * A call of the agent's program's own tool that Halonic let through without
 * asking anyone, under the rule `rule` (requirement `events.harness-allowed`).
 * `asks-in-sandbox`: the agent's file says `asks: in-sandbox` and the call
 * stayed in its working folder inside Halonic's fence (HAL-14992). `tool`:
 * the program's tool, such as `Edit` or `Bash`. `detail`: the path it read
 * or edited, the command it ran (at most 2,000 characters), or `""`.
 */
export interface HarnessAllowedEvent {
  type: "harness.allowed";
  agent: string;
  tool: string;
  detail: string;
  rule: "asks-in-sandbox";
}
