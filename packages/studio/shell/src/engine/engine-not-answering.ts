import { KindedError } from "@halonicjs/std";

/**
 * What a host rejects with when the engine can't be reached. It is the only failure a page words
 * as "isn't answering", in the words for where Studio runs (`EngineWords.notAnswering`), and it
 * ignores this error's message, so the host needn't know them. Any other failure gives its own
 * reason, or "Halonic ran into a problem it can't explain yet." (microcopy 22 F13).
 */
export class EngineNotAnswering extends KindedError {
  constructor() {
    super("unavailable", "The engine isn't answering.");
  }
}
