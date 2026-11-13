import { type ConnectorState, type StepId, savedConnectorState } from "@halonicjs/google-setup";
import type { GoogleSetupAccount } from "./api.ts";

/** What the item says when Google refused the account, and where it opens. */
export interface ConnectorProblem {
  /** A bold first line, only when the sign-in sentence has a hint to lead with. */
  readonly lead?: string;
  readonly text: string;
  /** The button's words. It opens the step in `actionStep`, never Google itself. */
  readonly action: string;
  readonly actionStep: StepId;
  /** The steps the item reopens at, in the order the user does them. */
  readonly reopenAt: readonly StepId[];
}

const signInLead =
  "Your app is probably still in Testing. Google ends the sign-in after 7 days for those. Publish it, then sign in again.";

function signInText(email: string, inProduction: boolean): string {
  // The "Testing" clause goes when "In production" was ticked: the user did it right (UX checklists 8.4).
  const causes = inProduction
    ? "when access is removed in your Google account or when the password changes"
    : "when access is removed in your Google account, when the password changes, or when an app in Testing reaches 7 days";
  return `Google no longer accepts Halonic's sign-in for ${email}. This happens ${causes}. Nothing was sent.`;
}

function describe(
  state: ConnectorState,
  account: GoogleSetupAccount,
): ConnectorProblem | undefined {
  switch (state.kind) {
    case "needs-sign-in-again":
      return {
        ...(state.testingHint ? { lead: signInLead } : {}),
        text: signInText(account.email, account.record.inProductionTickedAt !== null),
        action: "Sign in with Google",
        actionStep: "sign-in",
        reopenAt: state.reopenAt,
      };
    case "needs-new-secret":
      return {
        text: state.clientGone
          ? "Google doesn't recognise this client any more. Create a new client and sign in again."
          : "Google no longer accepts the saved client secret. Paste the current one.",
        action: state.clientGone ? "Create a new client" : "Replace secret",
        actionStep: state.clientGone ? "client" : "credentials",
        reopenAt: state.reopenAt,
      };
    case "api-off":
      // A switched-off API is told on the run and on the connector, never as a setup item.
      return undefined;
  }
}

/**
 * The refusal the account's setup record keeps, as the item words it (design 5.2), or `undefined`
 * when Google has refused nothing.
 *
 * @example
 * connectorProblem(account)?.action; // "Sign in with Google"
 */
export function connectorProblem(account: GoogleSetupAccount): ConnectorProblem | undefined {
  const state = savedConnectorState(account.record);
  return state === null ? undefined : describe(state, account);
}
