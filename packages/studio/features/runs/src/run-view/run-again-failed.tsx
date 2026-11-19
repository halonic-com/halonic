import { Callout } from "@halonicjs/studio-kit";
import type { EngineWords } from "@halonicjs/studio-shell";
import { FailureReason } from "../load-failure.tsx";
import { runPageWords } from "../run-words.ts";
import type { RunAgain } from "./run-again.ts";

/**
 * Why the last **Run again** didn't start, in a danger Callout named "Run didn't start"; nothing
 * while it hasn't failed. The run page shows it under its header, the run card over its banner.
 */
export function RunAgainFailed({
  runAgain,
  engine,
}: {
  readonly runAgain: RunAgain | undefined;
  readonly engine: EngineWords;
}) {
  if (runAgain?.problem === undefined) return null;
  return (
    <section aria-label={runPageWords.runAgainFailedName}>
      <Callout tone="danger">
        {runPageWords.runAgainFailedTitle}:{" "}
        <FailureReason
          what={runPageWords.runAgainFailedTitle}
          error={runAgain.problem.error}
          engine={engine}
        />
      </Callout>
    </section>
  );
}
