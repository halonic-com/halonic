import { Callout, type CalloutHandle } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
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
 * only asks; it never trusts by itself. A declined answer keeps the refusal, in a calm tone. The
 * button stays, busy, while the dialog asks, so it keeps focus; the answer is said through
 * `announce`, and a trusted answer, which drops the button, moves focus to the banner.
 */
export function InstructionsRefusalBanner({
  refusal,
  host,
  announce,
}: {
  readonly refusal: RefusedInstructions;
  readonly host: InstructionTrustHost | undefined;
  readonly announce?: ((line: string) => void) | undefined;
}) {
  const [answer, setAnswer] = useState<InstructionTrustAnswer>();
  const banner = useRef<CalloutHandle>(null);
  const { agent, pin, changed } = refusal;

  const review = async () => {
    if (host === undefined) return;
    const given = await host.trust(agent, pin);
    setAnswer(given);
    announce?.(answerLine(given));
  };

  const first =
    changed === true
      ? runPageWords.instructionsChanged(agent)
      : runPageWords.instructionsFirstTime(agent);
  const trusted = answer === "trusted";
  // The button is gone once trusted, so focus goes to the banner that says so.
  useEffect(() => {
    if (trusted) banner.current?.focus();
  }, [trusted]);
  const action =
    host === undefined || trusted
      ? undefined
      : { label: runPageWords.reviewInstructions, onClick: review };
  return (
    <section aria-label={runPageWords.instructionsName}>
      <Callout
        tone={answer === undefined ? "warning" : "info"}
        {...(action ? { action } : {})}
        {...(trusted ? { announce: "focus" as const, ref: banner } : {})}
      >
        <span className="block">{first}</span>
        {host === undefined ? (
          <span className="block">{runPageWords.instructionsOnComputer}</span>
        ) : null}
        {answer === undefined ? null : <span className="block">{answerLine(answer)}</span>}
      </Callout>
    </section>
  );
}
