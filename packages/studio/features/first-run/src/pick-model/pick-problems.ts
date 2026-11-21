import {
  type ChoiceProblem,
  choiceProvider,
  type KeyProblem,
  type ModelChoice,
  type TestOutcome,
} from "@halonicjs/app";
import type { ModelChoiceSaved, ModelChoiceTest } from "../api.ts";

/**
 * Why the last press stopped, as the error table of first-run-flow 3.3 lists it. `tone` is `amber`
 * where nothing is wrong with what the person gave (no credit, a model too small): they pick
 * something else rather than fix it.
 */
export type PickProblem =
  | { readonly kind: "not-a-key"; readonly problem: KeyProblem; readonly tone: "red" }
  | { readonly kind: "files"; readonly problem: ChoiceProblem; readonly tone: "red" }
  | {
      readonly kind: "tested";
      readonly outcome: Exclude<TestOutcome, "ok">;
      /** The provider's name, such as "Anthropic", which the words name. */
      readonly name: string;
      readonly tone: "red" | "amber";
    }
  /** The files changed between the test and its trust line, so the test is gone: test again. */
  | { readonly kind: "changed"; readonly tone: "red" }
  | {
      readonly kind: "not-saved";
      readonly failed: Exclude<ModelChoiceSaved, { ok: true }>["failed"];
      readonly keySaved: boolean;
      readonly reason: string;
      readonly tone: "red";
    };

/** The outcomes shown in amber: the key or the model works, but the run would fail. */
const amberOutcomes: ReadonlySet<TestOutcome> = new Set(["no-credit", "local-not-usable"]);

/** The problem a test that didn't pass gives. */
export function problemOfTest(
  choice: ModelChoice,
  tested: Exclude<ModelChoiceTest, { kind: "superseded" } | { outcome: "ok" }>,
): PickProblem {
  if (tested.kind === "not-a-key") return { ...tested, tone: "red" };
  if (tested.kind === "files") return { ...tested, tone: "red" };
  const tone = amberOutcomes.has(tested.outcome) ? "amber" : "red";
  return { kind: "tested", outcome: tested.outcome, name: choiceProvider(choice).name, tone };
}

/** The problem a Continue that didn't save gives. */
export function problemOfSave(saved: Exclude<ModelChoiceSaved, { ok: true }>): PickProblem {
  return {
    kind: "not-saved",
    failed: saved.failed,
    keySaved: saved.keySaved,
    reason: saved.reason,
    tone: "red",
  };
}
