import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { defineMessages } from "../messages/define.ts";
import { bold, phrase, plainText } from "../messages/phrase.ts";
import { stopMessages } from "../messages/stop.ts";
import { fakeSignals as signals } from "../test/fake-signals.ts";
import { exitOnceWritten, type PendingOutput, stopExitCode, watchForStop } from "./stop.ts";

const run = defineMessages("test", {
  cancelled: () =>
    phrase`The run 01JD8Q was cancelled after the step ${bold("Classify")}. Nothing after it ran.`,
});

/** A stream still holding `held` characters, which it hands on when the test says so. */
function stream(held: number): { output: PendingOutput; handOn(): void } {
  const waiting: (() => void)[] = [];
  return {
    output: {
      writableLength: held,
      write: (_text, written) => waiting.push(written),
    },
    handOn() {
      for (const written of waiting) {
        written();
      }
    },
  };
}

verifies("cli.stop", () => {
  it("asks the command to stop at Ctrl C, and ends with 130", () => {
    const source = signals();
    const exits: number[] = [];
    const watch = watchForStop(source, (code) => exits.push(code));
    expect(watch.signal.aborted).toBe(false);
    source.send("SIGINT");
    expect(watch.signal.aborted).toBe(true);
    expect(watch.stoppedBy()).toBe("SIGINT");
    expect(stopExitCode[watch.stoppedBy() ?? "SIGINT"]).toBe(130);
    expect(exits).toEqual([]);
  });

  it("ends with 143 for SIGTERM, as when a CI job is cancelled", () => {
    const source = signals();
    const watch = watchForStop(source, () => {});
    source.send("SIGTERM");
    expect(watch.stoppedBy()).toBe("SIGTERM");
    expect(stopExitCode.SIGTERM).toBe(143);
  });

  it("exits at once at a second signal, when stopping hangs", () => {
    const source = signals();
    const exits: number[] = [];
    watchForStop(source, (code) => exits.push(code));
    source.send("SIGINT");
    source.send("SIGINT");
    expect(exits).toEqual([130]);
  });

  it("leaves the signals to the process once the command is done", () => {
    const source = signals();
    const watch = watchForStop(source, () => {});
    expect(source.count()).toBe(2);
    watch.dispose();
    expect(source.count()).toBe(0);
  });

  it("exits at once when the streams hold nothing more", () => {
    const exits: number[] = [];
    const exitNow = exitOnceWritten([stream(0).output, stream(0).output], (code) =>
      exits.push(code),
    );
    exitNow(130);
    expect(exits).toEqual([130]);
  });

  it("exits only once every stream has handed on what it held, as through a pipe", () => {
    const exits: number[] = [];
    const stdout = stream(70_000);
    const stderr = stream(9);
    const exitNow = exitOnceWritten([stdout.output, stderr.output], (code) => exits.push(code));
    exitNow(143);
    expect(exits).toEqual([]);
    stdout.handOn();
    expect(exits).toEqual([]);
    stderr.handOn();
    expect(exits).toEqual([143]);
  });

  it("exits at once at a further signal while it waits, when nobody reads the pipe", () => {
    const exits: number[] = [];
    const exitNow = exitOnceWritten([stream(70_000).output], (code) => exits.push(code));
    exitNow(130);
    exitNow(143);
    expect(exits).toEqual([143]);
  });

  it("says Stopped, then what that meant", () => {
    expect(plainText(stopMessages.stopped(run.cancelled().phrase).phrase)).toBe(
      "Stopped. The run 01JD8Q was cancelled after the step Classify. Nothing after it ran.",
    );
    expect(plainText(stopMessages.stopped().phrase)).toBe("Stopped.");
  });
});
