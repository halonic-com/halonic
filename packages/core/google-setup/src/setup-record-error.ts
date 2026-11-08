/** Why a setup record call was refused. */
export type SetupRecordErrorReason =
  /** No record is saved under the account ref. */
  | "not-found"
  /** The stored record isn't a valid setup record, for example after an edit by hand. */
  | "damaged"
  /** The edit would make an invalid record, such as a client ID that isn't one. */
  | "refused";

const messages: Record<SetupRecordErrorReason, string> = {
  "not-found": "No Google setup is saved for this account. Start the setup again.",
  damaged: "The saved Google setup for this account can't be read. Start the setup over.",
  refused: "This change can't be saved to the Google setup. Check the value and try again.",
};

/**
 * A refused setup record call. Its message is fixed per reason, so it never
 * repeats a value: a damaged record or a swapped field could hold anything.
 */
export class SetupRecordError extends Error {
  /** Why the call was refused. */
  readonly reason: SetupRecordErrorReason;

  constructor(reason: SetupRecordErrorReason) {
    super(messages[reason]);
    this.name = "SetupRecordError";
    this.reason = reason;
  }
}
