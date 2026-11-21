import { isSetupCause, runFailureOf } from "@halonicjs/app/run-failure";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import { runFailedLines } from "./messages/run-failures.ts";
import { failedWith, general } from "./test/run-failure-fixtures.ts";

// A run the model check stopped, because a key may not go where its provider
// points or the workspace isn't trusted, says so and gives the one fix, not
// "can't tell the cause" and a bug report (C561 #1 on HAL-15333).

const run = { title: "Note", step: "Write", runId: "01JD8Q" };

/** The failure and its two lines, for a run that failed with `error` and this cause. */
function linesFor(code: string, detail: Record<string, string>, dir?: string) {
  const cause = { kind: "denied" as const, code, detail };
  const failure = runFailureOf({ ...failedWith("error"), cause }, undefined);
  if (failure === undefined) throw new Error("expected a failure");
  const { message, fix } = runFailedLines({ ...run, dir }, failure);
  return {
    failure,
    setup: isSetupCause(cause),
    lines: [plainText(message.phrase), fix === undefined ? undefined : plainText(fix.phrase)],
  };
}

verifies("cli.run-failure", () => {
  it("names the provider, the key and the address, and gives the allow-address command", () => {
    const { failure, setup, lines } = linesFor("models.key-origin-not-allowed", {
      provider: "gateway",
      key: "gw-key",
      origin: "https://other.example.com",
    });

    expect(failure).toEqual({
      reason: "key-address-not-allowed",
      provider: "gateway",
      key: "gw-key",
      address: "https://other.example.com",
    });
    expect(setup).toBe(true);
    expect(lines).toEqual([
      'Note failed in the step Write: provider "gateway" can\'t send key "gw-key" to https://other.example.com. That address isn\'t allowed for this key.',
      'Only allow an address you recognise. To allow it, run halonic models allow-address "gw-key" https://other.example.com, then run again.',
    ]);
  });

  it("names the address a key would go to in a workspace that isn't trusted, and the trust command", () => {
    const { lines } = linesFor(
      "models.untrusted-provider-address",
      { provider: "gateway", origin: "https://llm.example.com" },
      "./acme",
    );

    expect(lines).toEqual([
      "Note failed in the step Write: provider gateway would send its key to https://llm.example.com, and this workspace isn't trusted on this computer. Nothing was sent.",
      "Check providers/gateway.yaml, then trust the workspace with halonic trust --dir ./acme, or point it at the type's own address.",
    ]);
  });

  it("says a workspace that isn't trusted calls no real model, and how to use the test model", () => {
    const { lines } = linesFor("models.untrusted-workspace", { provider: "openai" });

    expect(lines).toEqual([
      "Note failed in the step Write: provider openai calls a real model, and this workspace isn't trusted on this computer, so nothing was sent.",
      "Check the workspace, then trust it with halonic trust, or set type: mock in providers/openai.yaml to use the test model.",
    ]);
  });

  it("gives the general lines when the cause doesn't name the key", () => {
    const cause = {
      kind: "denied" as const,
      code: "models.key-origin-not-allowed",
      detail: { provider: "gateway", origin: "https://other.example.com" },
    };

    expect(runFailureOf({ ...failedWith("error"), cause }, undefined)).toEqual(general);
    expect(isSetupCause(cause)).toBe(false);
  });
});
