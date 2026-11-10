// The harness calls of this engine that wait for a person's answer to an
// approval. Only the answer passes through here: the harness's own id for
// the approval stays in its call, and the run log has the engine's.

import type { StopSignal } from "@halonicjs/std";
import { unlessStopped } from "../harness/unless-stopped.ts";
import type { AnswerHarnessEffect } from "../kernel/decide-types.ts";

/**
 * The harness calls waiting for an answer, by run. A run waits on one call
 * at a time, and that call asks one question at a time, so the run's id is
 * enough to find the call an answer is for.
 */
export class HarnessAnswers {
  readonly #waiting = new Map<string, PromiseWithResolvers<AnswerHarnessEffect>>();

  /**
   * Waits for the answer to the question `ask` records for the run's harness
   * call. The wait starts before `ask`, so an answer that comes as soon as
   * the question is stored still finds it.
   *
   * @throws what `ask` throws
   * @throws `stop.reason` when `stop` is told to stop before the answer comes
   */
  async waitFor(
    runId: string,
    stop: StopSignal,
    ask: () => Promise<void>,
  ): Promise<AnswerHarnessEffect> {
    const answer = Promise.withResolvers<AnswerHarnessEffect>();
    this.#waiting.set(runId, answer);
    try {
      await ask();
      return await unlessStopped(stop, answer.promise);
    } finally {
      this.#waiting.delete(runId);
    }
  }

  /**
   * Gives the run's waiting harness call the answer.
   *
   * @returns false when no harness call of this engine waits for one in the run
   */
  give(runId: string, answer: AnswerHarnessEffect): boolean {
    const waiting = this.#waiting.get(runId);
    if (waiting === undefined) return false;
    this.#waiting.delete(runId);
    waiting.resolve(answer);
    return true;
  }
}
