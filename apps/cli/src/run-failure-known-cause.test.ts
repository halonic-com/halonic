import { runFailureOf } from "@halonicjs/app/run-failure";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import { runFailedLines } from "./messages/run-failures.ts";
import { failedWith, fixLine } from "./test/run-failure-fixtures.ts";

// An `error` whose cause is known says the engine's message as line 1's
// reason, with no report link (HAL-13862).

verifies("cli.run-failure", () => {
  it("says a bridge socket path that is too long as the reason, with no report link", () => {
    const error =
      "The bridge's socket path would be 161 bytes, and Linux takes at most 107. Move Halonic's data folder to a shorter path, such as ~/.halonic, and set HALONIC_HOME to that path.";
    const failed = {
      ...failedWith("error"),
      error,
      cause: {
        kind: "invalid_input" as const,
        code: "harness-bridge.socket-path-too-long",
        detail: { bytes: "161", limit: "107", system: "Linux" },
      },
    };

    const failure = runFailureOf(failed, undefined);

    expect(failure).toEqual({ reason: "error", message: error, causeKnown: true });
    if (failure === undefined) throw new Error("expected a failure");
    const run = { title: "Support reply", step: "Draft a reply", runId: "01JD8Q" };
    expect(plainText(runFailedLines(run, failure).message.phrase)).toBe(
      `Support reply failed in the step Draft a reply. ${error}`,
    );
    expect(fixLine(failure)).toBeUndefined();
  });
});
