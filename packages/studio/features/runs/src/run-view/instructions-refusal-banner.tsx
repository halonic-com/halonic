import { Callout } from "@halonicjs/studio-kit";
import { useState } from "react";
import type { InstructionTrustAnswer, InstructionTrustHost } from "../api.ts";
import { runPageWords } from "../run-words.ts";
import type { RefusedInstructions } from "./instructions-refusal.ts";

/** The line under the first one, for what the person's last answer came to. */
function answerLine(answer: InstructionTrustAnswer): string {
  switch (answer) {
    case "trusted":
      return runPageWords.instructionsTrusted;
    case "declined":
      return runPageWords.instructionsDeclined;
    case "busy":
      return runPageWords.instructionsBusy;
    case "unavailable":
      return runPageWords.instructionsUnavailable;
  }
}

/**
 * The failed banner of a run the harness check refused: what happened, and **Review instructions**,
 * which asks in the shell's own dialog (requirement `runs.run-view.instructions-refusal`). Without
 * a `host` (a served page or a phone) it says to trust on the computer and has no button. The page
 * only asks; it never trusts by itself. A declined answer keeps the refusal, in a calm tone.
 */
export function InstructionsRefusalBanner({
  refusal,
  host,
}: {
  readonly refusal: RefusedInstructions;
  readonly host: InstructionTrustHost | undefined;
}) {
  const [answer, setAnswer] = useState<InstructionTrustAnswer>();
  const [asking, setAsking] = useState(false);
  const { agent, pin, changed } = refusal;

  const review = async () => {
    if (host === undefined) return;
    setAsking(true);
    try {
      setAnswer(await host.trust(agent, pin));
    } finally {
      setAsking(false);
    }
  };

  const first =
    changed === true
      ? runPageWords.instructionsChanged(agent)
      : runPageWords.instructionsFirstTime(agent);
  const action =
    host === undefined || answer === "trusted" || asking
      ? undefined
      : { label: runPageWords.reviewInstructions, onClick: () => void review() };
  return (
    <section aria-label={runPageWords.instructionsName}>
      <Callout tone={answer === undefined ? "warning" : "info"} {...(action ? { action } : {})}>
        <span className="block">{first}</span>
        {host === undefined ? (
          <span className="block">{runPageWords.instructionsOnComputer}</span>
        ) : null}
        {answer === undefined ? null : <span className="block">{answerLine(answer)}</span>}
      </Callout>
    </section>
  );
}
