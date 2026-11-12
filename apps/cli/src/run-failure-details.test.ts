import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { CliCommand } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { defineMessages } from "./messages/define.ts";
import { phrase } from "./messages/phrase.ts";
import { runCli } from "./run-cli.ts";
import { runFailureDetails } from "./run-failure-details.ts";
import type { RunFailedEvent } from "./run-failure-of.ts";
import { captureIo } from "./test/capture-io.ts";

/** The parts of an event every log entry has, with `seq` counted by the caller. */
function logged<Event extends object>(seq: number, event: Event) {
  return { runId: "run_1", seq, at: "2026-11-10T14:01:00.000Z", ...event };
}

/** A log that read the email, then failed drafting: two turns, a move to another model, and a skip. */
function draftFailed(): readonly RunEvent[] {
  const events = [
    { type: "state.entered", state: "read" },
    { type: "llm.request", agent: "sorter", provider: "mock", model: "echo", messages: 1 },
    { type: "state.entered", state: "draft" },
    { type: "llm.request", agent: "writer", provider: "anthropic", model: "claude", messages: 1 },
    { type: "llm.request", agent: "writer", provider: "anthropic", model: "claude", messages: 3 },
    {
      type: "llm.fallback",
      agent: "writer",
      from: "smart",
      to: "fast",
      error: "provider error",
      providerText: { status: 529, text: "overloaded" },
    },
    {
      type: "llm.skipped",
      agent: "writer",
      alias: "fast",
      provider: "openai",
      model: "gpt",
      reason: "no-key",
      next: "default",
    },
  ];
  return events.map((event, seq) => logged(seq, event)) as RunEvent[];
}

const failed: RunFailedEvent = logged(7, {
  type: "run.failed",
  state: "draft",
  error: "model call failed",
  reason: "error",
  providerText: { status: 400, text: "max_tokens is too large" },
}) as RunFailedEvent;

verifies("cli.run-failure-debug", () => {
  it("gives the engine's error, the provider's text and the failed step's model calls", () => {
    expect(runFailureDetails(draftFailed(), failed).split("\n")).toEqual([
      "The engine said: model call failed",
      "The provider said (HTTP 400): max_tokens is too large",
      "Model calls in this step:",
      "  writer called claude at anthropic 2 times",
      "  writer moved from smart to fast: provider error",
      "    The provider said (HTTP 529): overloaded",
      "  writer skipped fast: its key isn't set, then tried default",
    ]);
  });

  it("says when the step called no model, and leaves out what the log doesn't hold", () => {
    const events = [logged(0, { type: "state.entered", state: "send" })] as RunEvent[];
    const bare = logged(1, { type: "run.failed", state: "send", error: " " }) as RunFailedEvent;

    expect(runFailureDetails(events, bare)).toBe("No model calls in this step.");
  });

  it("is printed under the result only with --debug, scrubbed as a whole", async () => {
    // A made-up value over two lines, as a PEM key would be.
    const key = "made-up\nkey-42";
    const io = captureIo("/work");
    const words = defineMessages("failedTest", {
      summary: () => phrase`Fail with details`,
      failed: () => phrase`It failed.`,
    });
    const command: CliCommand = {
      name: "fail",
      usage: "",
      summary: words.summary(),
      options: {},
      async run(_input, context) {
        const loaded = await context.secrets.get("provider-key");
        return {
          exitCode: exitCode.failed,
          lines: [words.failed().phrase],
          json: {},
          debugText: `The provider said: refused ${loaded}\nModel calls in this step:`,
        };
      },
    };
    const secrets = { get: async (name: string) => (name === "provider-key" ? key : null) };

    await runCli(["fail", "--debug"], io, [command], { secrets });
    expect(io.stdout).toEqual(["It failed."]);
    expect(io.stderr).toEqual([
      "The provider said: refused [secret removed]",
      "Model calls in this step:",
    ]);

    const quiet = captureIo("/work");
    await runCli(["fail"], quiet, [command], { secrets });
    expect(quiet.stderr).toEqual([]);
  });
});
