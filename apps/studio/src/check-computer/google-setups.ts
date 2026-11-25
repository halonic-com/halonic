import { setupInputOf, setupSteps } from "@halonicjs/google-setup";
import type { GoogleFact } from "@halonicjs/studio-feature-check-computer/api";
import type { GoogleSetupAccount } from "@halonicjs/studio-feature-google-setup/api";

/**
 * The Google line of each setup that was started and isn't finished (first-run-progress 4.2): the
 * first step not done and how many there are, as the Inbox's entry counts them ("Step 4 of 7").
 * An account with no service has nothing to set up, and one with every step done has no line: an
 * unfinished setup is progress, so there is nothing to say once it is done.
 *
 * @example
 * googleSetupFacts(await accounts.list());
 * // [{ check: "google", step: 4, steps: 7, startedAt: 2026-11-08, email: "x@example.com" }]
 */
export function googleSetupFacts(accounts: readonly GoogleSetupAccount[]): GoogleFact[] {
  return accounts.flatMap((account) => {
    if (account.services.length === 0) return [];
    const { record } = account;
    const steps = setupSteps(setupInputOf(record, account.email, account.services)).steps;
    const next = steps.find((step) => record.stepsDone[step.id] === undefined);
    if (next === undefined) return [];
    return [
      {
        check: "google",
        step: next.number,
        steps: steps.length,
        startedAt: new Date(record.startedAt),
        email: account.email,
      } satisfies GoogleFact,
    ];
  });
}
