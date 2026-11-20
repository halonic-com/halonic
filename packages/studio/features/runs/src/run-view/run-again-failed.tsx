import { Callout } from "@halonicjs/studio-kit";
import type { EngineWords } from "@halonicjs/studio-shell";
import { FailureReason } from "../load-failure.tsx";
import { runPageWords } from "../run-words.ts";
import type { RunAgain } from "./run-again.ts";

/**
 * Why the last **Run again** didn't start, in a danger Callout named "Run didn't start", with
 * **Try again** (microcopy 9.6); nothing while it hasn't failed. The run page shows it under its header, the run card over its banner.
 * A refusal because the workspace isn't trusted yet has **Review** instead, which opens the trust
 * check; once the person trusts it, the Callout goes and `onTrusted` gives focus to **Run again**,
 * as **Review** is gone (C144 RT1).
 */
export function RunAgainFailed({
  runAgain,
  engine,
  onTrusted,
}: {
  readonly runAgain: RunAgain | undefined;
  readonly engine: EngineWords;
  readonly onTrusted: () => void;
}) {
  if (runAgain?.problem === undefined) return null;
  const { review } = runAgain;
  return (
    <section aria-label={runPageWords.runAgainFailedName}>
      <Callout
        tone="danger"
        action={
          review === undefined
            ? { label: runPageWords.tryAgain, onClick: runAgain.start }
            : {
                label: runPageWords.review,
                onClick: () =>
                  void review().then((answer) => {
                    if (answer === "trusted") onTrusted();
                  }),
              }
        }
      >
        {runPageWords.runAgainFailedTitle}:{" "}
        <FailureReason
          what={runPageWords.runAgainFailedTitle}
          error={runAgain.problem.error}
          engine={engine}
          afterColon
        />
      </Callout>
    </section>
  );
}
