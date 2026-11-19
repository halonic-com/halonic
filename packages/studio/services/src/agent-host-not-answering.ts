import type { AgentHostError } from "@halonicjs/adapter-agent-host-client";
import { EngineNotAnswering } from "@halonicjs/studio-shell";

/**
 * The shell's refusal when the agent host isn't running, didn't start or
 * didn't answer in time (`host_unavailable`). To a person that is the
 * engine not answering, and the host starts again on the next request, so
 * it is an {@link EngineNotAnswering}: every screen words it from
 * `engineWords` and offers **Try again** (UX check G2, HAL-12410).
 *
 * It keeps what the shell said: `status` `0` and `code` `host_unavailable`
 * as an {@link AgentHostError} has them, the sandbox `reason` the shell may
 * give (`wsl-missing`, `distro-missing`), and the refusal itself as `cause`,
 * for the log. Its message is the engine's, never the shell's.
 */
export class AgentHostNotAnswering extends EngineNotAnswering {
  /** `0`: the call never reached the host. */
  readonly status = 0;
  /** The shell's own kind for this refusal. */
  readonly code = "host_unavailable";
  /** The sandbox reason the shell gave for a host it couldn't start, when it gave one. */
  readonly reason: string | undefined;
  /** The shell's refusal, with its message, for the log. */
  override readonly cause: AgentHostError;

  constructor(refusal: AgentHostError) {
    super();
    this.reason = refusal.reason;
    this.cause = refusal;
  }
}
