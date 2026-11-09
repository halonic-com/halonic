import type { ErrorKind } from "@halonicjs/std";

/** Why a client secret call was refused. */
export type ClientSecretErrorReason =
  /** The value was empty or only spaces. */
  | "empty"
  /** There is no saved secret for the ref, so there is nothing to replace. */
  | "not-saved"
  /** `promote` was called with no staged secret for the ref. */
  | "nothing-staged";

const kinds: Record<ClientSecretErrorReason, ErrorKind> = {
  empty: "invalid_input",
  "not-saved": "not_found",
  "nothing-staged": "conflict",
};

const messages: Record<ClientSecretErrorReason, string> = {
  empty: "The client secret is empty. Paste it from your client's page in Google Cloud.",
  "not-saved": "No client secret is saved for this Google client yet. Save one first.",
  "nothing-staged": "No new client secret is waiting to be checked. Paste the new secret again.",
};

/**
 * A refused client secret call. Its message is fixed per reason, so it can
 * never hold the secret.
 */
export class ClientSecretError extends Error {
  /** Why the call was refused. */
  readonly reason: ClientSecretErrorReason;

  constructor(reason: ClientSecretErrorReason) {
    super(messages[reason]);
    this.name = "ClientSecretError";
    this.reason = reason;
  }

  /** The coarse kind of the refusal; `reason` keeps the detail. */
  get kind(): ErrorKind {
    return kinds[this.reason];
  }
}
