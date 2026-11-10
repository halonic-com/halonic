import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { CliCommand } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { defineMessages } from "./messages/define.ts";
import { bold, phrase } from "./messages/phrase.ts";
import type { StopSignal } from "./output/stop.ts";
import { type CliSetup, runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";
import { fakeSignals } from "./test/fake-signals.ts";

const waitMessages = defineMessages("wait", {
  summary: () => phrase`Wait until stopped`,
  cancelled: () =>
    phrase`The run 01JD8Q was cancelled after the step ${bold("Classify")}. Nothing after it ran.`,
});

/** How the test command ends once it is asked to stop. */
type Ending = "returns" | "throws";

/**
 * A command that runs until it is asked to stop, then waits for `release`
 * and either returns that it stopped, or throws as an aborted fetch does.
 */
function waitCommand(ending: Ending, release: Promise<void> = Promise.resolve()): CliCommand {
  return {
    name: "wait",
    usage: "",
    summary: waitMessages.summary(),
    options: {},
    async run(_input, context) {
      await new Promise((resolve) => context.signal.addEventListener("abort", resolve));
      await release;
      if (ending === "throws") {
        throw new DOMException("This operation was aborted", "AbortError");
      }
      return {
        stopped: true,
        meaning: waitMessages.cancelled().phrase,
        json: { status: "failed" },
      };
    },
  };
}

/** Runs `halonic wait` with a stand-in for `process`, and sends `signal` once it runs. */
async function stopWith(
  signal: StopSignal,
  args: readonly string[] = [],
  ending: Ending = "returns",
) {
  const io = captureIo("/work");
  const signals = fakeSignals();
  const exits: number[] = [];
  const setup: CliSetup = { stop: { signals, exitNow: (code) => exits.push(code) } };
  const running = runCli(["wait", ...args], io, [waitCommand(ending)], setup);
  signals.send(signal);
  const code = await running;
  return { code, io, exits, listening: signals.count() };
}

verifies("cli.stop", () => {
  it("says what stopping meant on stderr, and ends with 130 for Ctrl C", async () => {
    const { code, io, exits } = await stopWith("SIGINT");
    expect(code).toBe(130);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual([
      "Stopped. The run 01JD8Q was cancelled after the step Classify. Nothing after it ran.",
    ]);
    expect(exits).toEqual([]);
  });

  it("ends with 143 for SIGTERM", async () => {
    expect((await stopWith("SIGTERM")).code).toBe(143);
  });

  it("with --json, ends stdout with one document that isn't ok, and leaves stderr empty", async () => {
    const { code, io } = await stopWith("SIGINT", ["--json"]);
    expect(code).toBe(130);
    expect(io.stderr).toEqual([]);
    expect(JSON.parse(io.stdout.join("\n"))).toEqual({
      outputVersion: 1,
      ok: false,
      status: "failed",
    });
  });

  it("says only Stopped. when what stopping threw is all the command left", async () => {
    const { code, io } = await stopWith("SIGTERM", [], "throws");
    expect(code).toBe(143);
    expect(io.stderr).toEqual(["Stopped."]);
  });

  it("leaves the signals to the process once the command is done", async () => {
    expect((await stopWith("SIGINT")).listening).toBe(0);
  });

  for (const [first, second, expected] of [
    ["SIGINT", "SIGTERM", 143],
    ["SIGTERM", "SIGINT", 130],
  ] as const) {
    it(`at ${second} after ${first}, prints only Stopped. and exits at once with ${expected}`, async () => {
      const io = captureIo("/work");
      const signals = fakeSignals();
      const exits: number[] = [];
      let release = () => {};
      const hanging = new Promise<void>((resolve) => {
        release = resolve;
      });
      const setup: CliSetup = { stop: { signals, exitNow: (code) => exits.push(code) } };
      const running = runCli(["wait"], io, [waitCommand("returns", hanging)], setup);
      signals.send(first);
      signals.send(second);
      expect(exits).toEqual([expected]);
      expect(io.stderr).toEqual(["Stopped."]);
      release();
      await running;
    });
  }

  it("runs a command to its end when no signal comes", async () => {
    const io = captureIo("/work");
    const done: CliCommand = {
      ...waitCommand("returns"),
      run: async () => ({ exitCode: exitCode.ok, lines: [], json: {} }),
    };
    expect(
      await runCli(["wait"], io, [done], { stop: { signals: fakeSignals(), exitNow: () => {} } }),
    ).toBe(0);
  });
});
