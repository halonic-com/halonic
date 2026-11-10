import type { HarnessEvent } from "@halonicjs/ports";
import { SecretScrubber } from "@halonicjs/std";

/** What the filter needs to know about the run. */
export interface HarnessEventFilterOptions {
  /** The task agent's id: its `agent.finished` without a `parent` is the run's final event. */
  agentId: string;
  /** The run's bridge token. No event or error that passes the filter contains it. */
  bridgeToken: string;
}

/**
 * What every event a harness reads from its program passes through, so
 * each harness keeps the `Harness` port's promises in the same way
 * (requirement `harness-kit.event-filter`):
 *
 * - The bridge token is removed from every string in an event, and from
 *   every error message made with {@link error}. It is in the program's
 *   environment, so a tool call such as `env` can print it.
 * - The task agent's `agent.finished` without a `parent` is the final
 *   event. The filter lets it through once and nothing after it.
 *
 * @example
 * const filter = new HarnessEventFilter({ agentId: "writer", bridgeToken: bridge.token });
 * for (const event of filter.pass(eventsOf(line))) yield event;
 * if (failed) throw filter.error(`Codex stopped with an error: ${message}`);
 */
export class HarnessEventFilter {
  readonly #agentId: string;
  readonly #scrubber = new SecretScrubber();
  #finished = false;

  constructor(options: HarnessEventFilterOptions) {
    this.#agentId = options.agentId;
    this.#scrubber.remember(options.bridgeToken);
  }

  /** Whether the final `agent.finished` has passed. */
  get finished(): boolean {
    return this.#finished;
  }

  /**
   * The events without the bridge token, up to and including the final
   * `agent.finished`. Once it has passed, none.
   */
  pass(events: readonly HarnessEvent[]): HarnessEvent[] {
    const passed: HarnessEvent[] = [];
    for (const event of events) {
      if (this.#finished) break;
      passed.push(this.#withoutToken(event));
      if (this.#isFinal(event)) this.#finished = true;
    }
    return passed;
  }

  /** An error with this message, the bridge token removed from it. */
  error(message: string): Error {
    return new Error(this.#scrubber.scrub(message));
  }

  #isFinal(event: HarnessEvent): boolean {
    return (
      event.type === "agent.finished" && event.agent === this.#agentId && event.parent === undefined
    );
  }

  #withoutToken(event: HarnessEvent): HarnessEvent {
    // `scrubValue` changes only the text of strings and keeps the shape, so
    // the copy is still the same kind of event.
    return this.#scrubber.scrubValue(event) as HarnessEvent;
  }
}
