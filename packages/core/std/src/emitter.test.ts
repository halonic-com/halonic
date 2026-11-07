import { describe, expect, it } from "vitest";
import { Emitter } from "./emitter.ts";

interface TestEvents extends Record<string, unknown> {
  saved: { path: string };
  closed: undefined;
}

describe("std.emitter", () => {
  it("sends each event to its listeners, in the order they were added", () => {
    const emitter = new Emitter<TestEvents>();
    const calls: string[] = [];
    emitter.on("saved", ({ path }) => calls.push(`first ${path}`));
    emitter.on("saved", ({ path }) => calls.push(`second ${path}`));
    emitter.on("closed", () => calls.push("closed"));
    emitter.emit("saved", { path: "a.yaml" });
    expect(calls).toEqual(["first a.yaml", "second a.yaml"]);
  });

  it("does nothing for an event without listeners", () => {
    expect(() => new Emitter<TestEvents>().emit("closed", undefined)).not.toThrow();
  });

  it("stops calling a listener once it is removed, and removing twice is harmless", () => {
    const emitter = new Emitter<TestEvents>();
    let count = 0;
    const stop = emitter.on("closed", () => count++);
    emitter.emit("closed", undefined);
    stop();
    stop();
    emitter.emit("closed", undefined);
    expect(count).toBe(1);
    expect(emitter.listenerCount("closed")).toBe(0);
  });

  it("treats the same function added twice as two listeners", () => {
    const emitter = new Emitter<TestEvents>();
    let count = 0;
    const listener = () => count++;
    const stopFirst = emitter.on("closed", listener);
    emitter.on("closed", listener);
    stopFirst();
    emitter.emit("closed", undefined);
    expect(count).toBe(1);
    expect(emitter.listenerCount("closed")).toBe(1);
  });

  it("applies listeners added or removed during an event from the next event", () => {
    const emitter = new Emitter<TestEvents>();
    const calls: string[] = [];
    let stopSecond = () => {};
    emitter.on("closed", () => {
      calls.push("first");
      stopSecond();
      emitter.on("closed", () => calls.push("added"));
    });
    stopSecond = emitter.on("closed", () => calls.push("second"));
    emitter.emit("closed", undefined);
    expect(calls).toEqual(["first", "second"]);
  });

  it("still runs the other listeners when one throws, then throws its error", () => {
    const emitter = new Emitter<TestEvents>();
    const calls: string[] = [];
    const failure = new Error("listener broke");
    emitter.on("closed", () => {
      throw failure;
    });
    emitter.on("closed", () => calls.push("after"));
    expect(() => emitter.emit("closed", undefined)).toThrow(failure);
    expect(calls).toEqual(["after"]);
  });

  it("throws an AggregateError when several listeners throw", () => {
    const emitter = new Emitter<TestEvents>();
    emitter.on("closed", () => {
      throw new Error("one");
    });
    emitter.on("closed", () => {
      throw new Error("two");
    });
    let caught: unknown;
    try {
      emitter.emit("closed", undefined);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).message).toBe('2 listeners for "closed" failed.');
    expect((caught as AggregateError).errors.map((error: Error) => error.message)).toEqual([
      "one",
      "two",
    ]);
  });
});
