import { InputRefused } from "@halonicjs/engine";
import { KindedError } from "@halonicjs/std";
import { EngineNotAnswering, RoutineInputRefused } from "@halonicjs/studio-feature-routines/api";
import { EngineNotAnswering as ShellEngineNotAnswering } from "@halonicjs/studio-shell";

/**
 * What Run now rejects with for what the engine threw (UX check S5 of HAL-12390, RT3 of
 * HAL-15304). Only an engine that can't be reached is "not answering"; any other refusal keeps
 * its own sentence, also an `unavailable` one such as the window's refusal of what this routine
 * starts (`WindowCantStart`, `StartRefused`). The engine's refusal of the input is a
 * plain error, so it gets a kind, which lets the page show its sentence. An input that lacks a
 * field also gets its next step, the Starts card, so the toast offers no **Try again** (HAL-15680).
 */
export function runNowFailureOf(error: unknown): unknown {
  if (error instanceof ShellEngineNotAnswering) return new EngineNotAnswering();
  if (error instanceof InputRefused) {
    return error.code === "engine.input-missing-field"
      ? new RoutineInputRefused(error.message, { cause: error })
      : new KindedError("invalid_input", error.message, { cause: error });
  }
  return error;
}
