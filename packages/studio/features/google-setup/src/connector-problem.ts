import {
  type ConnectorState,
  personalAppOf,
  type StepId,
  savedConnectorState,
  signInEndsSoon,
  weeklySignIn,
} from "@halonicjs/google-setup";
import type { GoogleSetupAccount } from "./api.ts";
import { listNames } from "./ui/account-labels.ts";
import { weeklyWords } from "./weekly-words.ts";

/** What the item says when Google refused the account, and where it opens. */
export interface ConnectorProblem {
  /**
   * The weekly sign-in of a personal *Testing* app: it ends within a day, or it ended. The item
   * then folds "Why not publish?" under the banner (design 5.2 rows 2 and 3).
   */
  readonly weekly?: "ends-soon" | "ended";
  readonly text: string;
  /** The button's words. It opens the step in `actionStep`, never Google itself. */
  readonly action: string;
  readonly actionStep: StepId;
  /** The steps the item reopens at, in the order the user does them. */
  readonly reopenAt: readonly StepId[];
}

function signInText(email: string, published: boolean): string {
  // The "Testing" clause goes when the app was published: the user did it right (UX checklists 8.4).
  const causes = published
    ? "when access is removed in your Google account or when the password changes"
    : "when access is removed in your Google account, when the password changes, or when an app in Testing reaches 7 days";
  return `Google no longer accepts Halonic's sign-in for ${email}. This happens ${causes}. Nothing ran.`;
}

/** The services the account's workflows use, by name, such as "Gmail and Drive". */
function serviceNames(account: GoogleSetupAccount): string {
  return listNames(account.services.map((service) => service.label));
}

function describe(
  state: ConnectorState,
  account: GoogleSetupAccount,
): ConnectorProblem | undefined {
  switch (state.kind) {
    case "needs-sign-in-again":
      return {
        ...(state.weeklyEnd ? { weekly: "ended" } : {}),
        text: state.weeklyEnd
          ? weeklyWords.ended
          : signInText(account.email, personalAppOf(account.record)?.publishing === "production"),
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
 * A personal *Testing* app whose sign-in ends within a day (design 5.2 row 2): still signed in,
 * so it isn't a refusal, but the item opens at step 7 the same way.
 */
function endsSoon(account: GoogleSetupAccount, now: Date): ConnectorProblem | undefined {
  const weekly = weeklySignIn(account.record);
  if (weekly === null || !signInEndsSoon(account.record, now)) return undefined;
  return {
    weekly: "ends-soon",
    text: weeklyWords.endsSoon(weekly, serviceNames(account)),
    action: "Sign in with Google",
    actionStep: "sign-in",
    reopenAt: ["sign-in"],
  };
}

/**
 * The refusal the account's setup record keeps, as the item words it (design 5.2), or a sign-in
 * that ends within a day, or `undefined` when nothing needs the user.
 *
 * @param now - the time to judge "ends within a day" at
 * @example
 * connectorProblem(account)?.action; // "Sign in with Google"
 */
export function connectorProblem(
  account: GoogleSetupAccount,
  now: Date = new Date(),
): ConnectorProblem | undefined {
  const state = savedConnectorState(account.record);
  return state === null ? endsSoon(account, now) : describe(state, account);
}
