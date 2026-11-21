import { isSetupCause, runFailureOf } from "@halonicjs/app/run-failure";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import { runFailedLines } from "./messages/run-failures.ts";
import { failedWith } from "./test/run-failure-fixtures.ts";

// A run whose key may not go to its provider's address says so and gives the
// command that allows it, instead of asking for a bug report (HAL-15330).

const detail = { provider: "gateway", key: "fake-key", origin: "https://other.example.com" };

verifies("cli.run-failed-key-origin", () => {
  it("names the provider, the key and the address, and the allow-address command", () => {
    const failed = {
      ...failedWith("error"),
      cause: { kind: "denied" as const, code: "models.key-origin-not-allowed", detail },
    };

    const failure = runFailureOf(failed, undefined);

    expect(failure).toEqual({ reason: "key-origin-not-allowed", ...detail });
    if (failure === undefined) throw new Error("expected a failure");
    const run = { title: "Support reply", step: "Draft a reply", runId: "01JD8Q", dir: "./acme" };
    const { message, fix } = runFailedLines(run, failure);
    expect([
      plainText(message.phrase),
      fix === undefined ? undefined : plainText(fix.phrase),
    ]).toEqual([
      "Support reply failed in the step Draft a reply: provider gateway can't send key fake-key to https://other.example.com, because that address isn't allowed for this key.",
      "Only if you recognise that address, allow it with halonic models allow-address fake-key https://other.example.com, then run again.",
    ]);
    expect(isSetupCause(failed.cause)).toBe(true);
  });
});
