import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { defineMessages } from "../messages/define.ts";
import { bold, phrase, plainText } from "../messages/phrase.ts";
import { stopMessages } from "../messages/stop.ts";
import { type SignalSource, type StopSignal, stopExitCode, watchForStop } from "./stop.ts";

/** A stand-in for `process` that sends a signal when the test says so. */
function signals(): SignalSource & { send(signal: StopSignal): void; count(): number } {
  const listeners = new Map<StopSignal, Set<() => void>>();
  const of = (signal: StopSignal) => listeners.get(signal) ?? new Set();
  return {
    on(signal, listener) {
      listeners.set(signal, of(signal).add(listener));
    },
    off(signal, listener) {
      of(signal).delete(listener);
    },
    send(signal) {
      for (const listener of of(signal)) {
        listener();
      }
    },
    count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

const run = defineMessages("test", {
  cancelled: () =>
    phrase`The run 01JD8Q was cancelled after the step ${bold("Classify")}. Nothing after it ran.`,
});

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

  it("says Stopped, then what that meant", () => {
    expect(plainText(stopMessages.stopped(run.cancelled().phrase).phrase)).toBe(
      "Stopped. The run 01JD8Q was cancelled after the step Classify. Nothing after it ran.",
    );
    expect(plainText(stopMessages.stopped().phrase)).toBe("Stopped.");
  });
});
