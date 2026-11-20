import { isSetupCause, runFailureOf } from "@halonicjs/app/run-failure";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import { runFailedLines } from "./messages/run-failures.ts";
import { failedWith, general } from "./test/run-failure-fixtures.ts";

// A secrets file other users can read, which the secrets file store refuses
// with this cause, gets the same words as `halonic secret list` (HAL-12569).

const file = "/profile/secrets/secrets.json";

verifies("cli.run-failure", () => {
  it("names the secrets file and chmod 600, with no report link", () => {
    const failed = {
      ...failedWith("error"),
      cause: { kind: "denied" as const, code: "secrets.file-readable", detail: { file } },
    };

    const failure = runFailureOf(failed, undefined);

    expect(failure).toEqual({ reason: "secrets-file-readable", file });
    if (failure === undefined) throw new Error("expected a failure");
    const run = { title: "Support reply", step: "Draft a reply", runId: "01JD8Q" };
    const { message, fix } = runFailedLines(run, failure);
    expect([
      plainText(message.phrase),
      fix === undefined ? undefined : plainText(fix.phrase),
    ]).toEqual([
      `Support reply failed in the step Draft a reply: the secrets file ${file} can be read by other users.`,
      `Run chmod 600 ${file}, then run again.`,
    ]);
    expect(isSetupCause(failed.cause)).toBe(true);
  });

  it("gives the general lines when the cause doesn't name the file", () => {
    const failed = {
      ...failedWith("error"),
      cause: { kind: "denied" as const, code: "secrets.file-readable" },
    };

    expect(runFailureOf(failed, undefined)).toEqual(general);
    expect(isSetupCause(failed.cause)).toBe(false);
  });
});
