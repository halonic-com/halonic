import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { StopSource } from "./stop-signal.ts";

verifies("std.stop-signal", () => {
  it("tells each listener once, with the reason on the signal", () => {
    const source = new StopSource();
    const heard: string[] = [];
    source.signal.onStop(() => heard.push(String(source.signal.reason?.message)));

    source.stop(new Error("The engine stopped."));
    source.stop(new Error("Again."));

    expect(heard).toEqual(["The engine stopped."]);
    expect(source.signal.stopped).toBe(true);
    expect(() => source.signal.throwIfStopped()).toThrow("The engine stopped.");
  });

  it("is going on, and throws nothing, until it's told to stop", () => {
    const source = new StopSource();

    expect(source.signal.stopped).toBe(false);
    expect(source.signal.reason).toBeUndefined();
    expect(() => source.signal.throwIfStopped()).not.toThrow();
  });

  it("calls no listener that was removed", () => {
    const source = new StopSource();
    const heard: string[] = [];
    const remove = source.signal.onStop(() => heard.push("removed"));
    source.signal.onStop(() => heard.push("kept"));

    remove();
    source.stop(new Error("Stopped."));

    expect(heard).toEqual(["kept"]);
  });

  it("calls a listener added after the stop soon after it's added", async () => {
    const source = new StopSource();
    source.stop(new Error("Stopped."));
    const heard: string[] = [];

    source.signal.onStop(() => heard.push("late"));
    expect(heard).toEqual([]);
    await Promise.resolve();

    expect(heard).toEqual(["late"]);
  });

  it("calls no late listener that was removed before its turn", async () => {
    const source = new StopSource();
    source.stop(new Error("Stopped."));
    const heard: string[] = [];

    const remove = source.signal.onStop(() => heard.push("late"));
    remove();
    await Promise.resolve();

    expect(heard).toEqual([]);
  });

  it("still calls the other listeners when one throws, then throws its error", () => {
    const source = new StopSource();
    const heard: string[] = [];
    source.signal.onStop(() => {
      throw new Error("Listener failed.");
    });
    source.signal.onStop(() => heard.push("kept"));

    expect(() => source.stop(new Error("Stopped."))).toThrow("Listener failed.");
    expect(heard).toEqual(["kept"]);
    expect(source.signal.stopped).toBe(true);
  });

  it("throws an AggregateError when several listeners throw", () => {
    const source = new StopSource();
    for (const name of ["first", "second"]) {
      source.signal.onStop(() => {
        throw new Error(name);
      });
    }

    expect(() => source.stop(new Error("Stopped."))).toThrow(AggregateError);
  });
});
