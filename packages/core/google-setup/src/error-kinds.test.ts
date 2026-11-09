import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ClientSecretError, type ClientSecretErrorReason } from "./client-secret-error.ts";
import { SetupRecordError, type SetupRecordErrorReason } from "./setup-record-error.ts";

/** Throws and catches the error, so the kind is read the way a caller reads it. */
function caughtFrom(make: () => Error): unknown {
  try {
    throw make();
  } catch (caught) {
    return caught;
  }
}

verifies("google-setup.error-kinds", () => {
  it.each<[SetupRecordErrorReason, string]>([
    ["not-found", "not_found"],
    ["refused", "invalid_input"],
    ["cannot-share", "conflict"],
    ["damaged", "internal"],
  ])("gives SetupRecordError %s the kind %s", (reason, kind) => {
    expect(errorKindOf(caughtFrom(() => new SetupRecordError(reason)))).toBe(kind);
  });

  it.each<[ClientSecretErrorReason, string]>([
    ["empty", "invalid_input"],
    ["not-saved", "not_found"],
    ["nothing-staged", "conflict"],
  ])("gives ClientSecretError %s the kind %s", (reason, kind) => {
    expect(errorKindOf(caughtFrom(() => new ClientSecretError(reason)))).toBe(kind);
  });

  it("keeps the detailed reason and the message", () => {
    const error = new SetupRecordError("not-found");
    expect(error.reason).toBe("not-found");
    expect(error.message).toBe("No Google setup is saved for this account. Start the setup again.");
    const secretError = new ClientSecretError("empty");
    expect(secretError.reason).toBe("empty");
    expect(secretError.message).toBe(
      "The client secret is empty. Paste it from your client's page in Google Cloud.",
    );
  });
});
