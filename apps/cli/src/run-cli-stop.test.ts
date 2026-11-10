import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { CliCommand } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { defineMessages } from "./messages/define.ts";
import { bold, phrase } from "./messages/phrase.ts";
import type { QuestionTerminal } from "./output/question.ts";
import type { StopSignal } from "./output/stop.ts";
import { type CliSetup, runCli, type Terminal } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";
import { fakeSignals } from "./test/fake-signals.ts";

const waitMessages = defineMessages("wait", {
  summary: () => phrase`Wait until stopped`,
  goOn: () => phrase`Go on?`,
  cancelled: () =>
    phrase`The run 01JD8Q was cancelled after the step ${bold("Classify")}. Nothing after it ran.`,
});

/** A terminal on every stream, without colour or live lines, so a question may be asked. */
const plainTerminal: Terminal = {
  env: { LANG: "en_US.UTF-8", NO_COLOR: "1", TERM: "dumb" },
  platform: "linux",
  stdoutIsTerminal: true,
  stderrIsTerminal: true,
};

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

  it("at Ctrl C during a question, stops waiting for the answer and says Stopped. on its own line", async () => {
    const io = captureIo("/work");
    const signals = fakeSignals();
    const written: string[] = [];
    const questions: QuestionTerminal = {
      write: (text) => written.push(text),
      // Like stdin with nobody typing: the answer comes only when the signal ends the reading.
      readLine: (signal) =>
        new Promise((resolve) => signal?.addEventListener("abort", () => resolve(undefined))),
    };
    const asking: CliCommand = {
      ...waitCommand("returns"),
      async run(_input, context) {
        await context.ask({
          question: waitMessages.goOn(),
          yes: false,
          refusal: () => new Error("no terminal"),
        });
        return { exitCode: exitCode.ok, lines: [], json: {} };
      },
    };
    const terminal: Terminal = { ...plainTerminal, questions };
    const running = runCli(["wait"], io, [asking], {
      terminal,
      stop: { signals, exitNow: () => {} },
    });
    await Promise.resolve();
    signals.send("SIGINT");
    expect(await running).toBe(130);
    expect(written).toEqual(["Go on? [y/N] ", "\n"]);
    expect(io.stderr).toEqual(["Stopped."]);
  });

  it("prints only one Stopped. when a third signal comes while the process waits to exit", async () => {
    const io = captureIo("/work");
    const signals = fakeSignals();
    const exits: number[] = [];
    let release = () => {};
    const hanging = new Promise<void>((resolve) => {
      release = resolve;
    });
    const setup: CliSetup = { stop: { signals, exitNow: (code) => exits.push(code) } };
    const running = runCli(["wait"], io, [waitCommand("returns", hanging)], setup);
    signals.send("SIGINT");
    signals.send("SIGINT");
    signals.send("SIGTERM");
    expect(exits).toEqual([130, 143]);
    expect(io.stderr).toEqual(["Stopped."]);
    release();
    await running;
  });

  it("keeps the command's own result and code when it finishes its work after Ctrl C", async () => {
    const io = captureIo("/work");
    const signals = fakeSignals();
    const finishing: CliCommand = {
      ...waitCommand("returns"),
      async run(_input, context) {
        // Doesn't stop early: it waits for the signal only so the test knows Ctrl C came first.
        await new Promise((resolve) => context.signal.addEventListener("abort", resolve));
        return { exitCode: exitCode.ok, lines: [waitMessages.goOn().phrase], json: {} };
      },
    };
    const running = runCli(["wait"], io, [finishing], { stop: { signals, exitNow: () => {} } });
    signals.send("SIGINT");
    expect(await running).toBe(0);
    expect(io.stdout).toEqual(["Go on?"]);
    expect(io.stderr).toEqual([]);
  });

  it("ends with 130 when a command says it stopped although no signal came", async () => {
    const io = captureIo("/work");
    const stoppedOnItsOwn: CliCommand = {
      ...waitCommand("returns"),
      run: async () => ({ stopped: true, meaning: waitMessages.cancelled().phrase, json: {} }),
    };
    const code = await runCli(["wait"], io, [stoppedOnItsOwn], {
      stop: { signals: fakeSignals(), exitNow: () => {} },
    });
    expect(code).toBe(130);
    expect(io.stderr).toEqual([
      "Stopped. The run 01JD8Q was cancelled after the step Classify. Nothing after it ran.",
    ]);
  });

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
