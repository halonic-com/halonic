import { type EngineWords, StartFailedCallout } from "@halonicjs/studio-shell";
import { runPageWords } from "../run-words.ts";
import type { RunAgain } from "./run-again.ts";

/**
 * Why the last **Run again** didn't start, in the shell's start-failure Callout under a section
 * named "Run didn't start", with **Try again** starting it again; nothing while it hasn't failed.
 * While that start is pending, **Try again** stays, busy, and keeps focus; when it fails again,
 * focus goes to the new Callout, as in the Run panel (C533-1).
 * The run page shows it under its header, the run card over its banner.
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
      <StartFailedCallout
        error={runAgain.problem.error}
        notAnswering={engine.notAnswering}
        tryAgain={runAgain.tryAgain}
        takeFocus={runAgain.problem.retried}
        review={
          review === undefined
            ? undefined
            : () =>
                void review().then((answer) => {
                  if (answer === "trusted") onTrusted();
                })
        }
      />
    </section>
  );
}
