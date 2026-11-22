/**
 * Reads what `claude auth status --json` prints for one seat folder. The
 * output names the account's e-mail address; that is compared with the
 * account the board set for the seat and then dropped, so no reading, log or
 * page ever holds it.
 */

/** Whether a seat is signed in with a Claude subscription. */
export type SignInState =
  /** Signed in with a Claude subscription: the seat can work. */
  | "signed-in"
  /** No sign-in in the seat folder: the board has to sign it in. */
  | "signed-out"
  /** Signed in another way (an API key, a cloud provider): paid per use, so never a seat. */
  | "not-subscription"
  /** The output wasn't the JSON Claude Code prints. */
  | "unreadable";

/** Whether the signed-in account is the one the board set for the seat. */
export type AccountMatch = "matches" | "differs" | "unknown";

/** One seat's sign-in, without the account's address. */
export interface SignInStatus {
  readonly state: SignInState;
  readonly account: AccountMatch;
  /** The subscription Claude Code names ("max", "pro", "team"), if any. */
  readonly plan: string | undefined;
  /** When the stored sign-in expires, as an ISO time, if Claude Code says. */
  readonly expiresAt: string | undefined;
}

const unreadable: SignInStatus = {
  state: "unreadable",
  account: "unknown",
  plan: undefined,
  expiresAt: undefined,
};

function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** An expiry as seconds or milliseconds since 1970, or as a date text. */
function expiry(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  const asText = text(value);
  if (asText === undefined || Number.isNaN(Date.parse(asText))) {
    return undefined;
  }
  return new Date(Date.parse(asText)).toISOString();
}

function accountMatch(email: string | undefined, expected: string | undefined): AccountMatch {
  if (email === undefined || expected === undefined || expected.trim() === "") {
    return "unknown";
  }
  return email.trim().toLowerCase() === expected.trim().toLowerCase() ? "matches" : "differs";
}

function parseJson(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

/**
 * A seat's sign-in from the JSON `claude auth status --json` printed. The
 * program exits with 1 when nobody is signed in; the JSON says the same, so
 * only the JSON is read. `expectedAccount` is the e-mail the board set for
 * the seat, if any.
 */
export function parseAuthStatus(output: string, expectedAccount: string | undefined): SignInStatus {
  const status = record(parseJson(output));
  const loggedIn = status?.["loggedIn"];
  if (status === undefined || typeof loggedIn !== "boolean") {
    return unreadable;
  }
  if (!loggedIn) {
    return { state: "signed-out", account: "unknown", plan: undefined, expiresAt: undefined };
  }
  const subscription = status["authMethod"] === "claude.ai";
  return {
    state: subscription ? "signed-in" : "not-subscription",
    account: accountMatch(text(status["email"]), expectedAccount),
    plan: text(status["subscriptionType"]),
    expiresAt: expiry(status["loginExpiresAt"]),
  };
}
