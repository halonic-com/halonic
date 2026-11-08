import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { EventBus } from "./event-bus.ts";

interface TestEvents {
  saved: { path: string };
  closed: undefined;
}

verifies("app.event-bus", () => {
  it("calls every listener once, in the order they were added", () => {
    const bus = new EventBus<TestEvents>();
    const calls: string[] = [];
    bus.on("saved", ({ path }) => calls.push(`a ${path}`));
    bus.on("saved", ({ path }) => calls.push(`b ${path}`));
    bus.emit("saved", { path: "x.yaml" });
    expect(calls).toEqual(["a x.yaml", "b x.yaml"]);
  });

  it("does nothing for an event without listeners", () => {
    const bus = new EventBus<TestEvents>();
    expect(() => bus.emit("closed", undefined)).not.toThrow();
  });

  it("stops calling a removed listener, and removing twice is harmless", () => {
    const bus = new EventBus<TestEvents>();
    let count = 0;
    const off = bus.on("closed", () => count++);
    off();
    off();
    bus.emit("closed", undefined);
    expect(count).toBe(0);
  });

  it("treats the same function added twice as two listeners", () => {
    const bus = new EventBus<TestEvents>();
    let count = 0;
    const listener = () => count++;
    const off = bus.on("closed", listener);
    bus.on("closed", listener);
    off();
    bus.emit("closed", undefined);
    expect(count).toBe(1);
  });

  it("still calls the others when one listener throws, then throws its error", () => {
    const bus = new EventBus<TestEvents>();
    let reached = false;
    bus.on("closed", () => {
      throw new Error("boom");
    });
    bus.on("closed", () => {
      reached = true;
    });
    expect(() => bus.emit("closed", undefined)).toThrow("boom");
    expect(reached).toBe(true);
  });

  it("throws an AggregateError when several listeners throw", () => {
    const bus = new EventBus<TestEvents>();
    for (const message of ["one", "two"]) {
      bus.on("closed", () => {
        throw new Error(message);
      });
    }
    expect(() => bus.emit("closed", undefined)).toThrow(AggregateError);
  });

  it("reports listener errors to onListenerError instead of throwing them", () => {
    const reported: string[] = [];
    const bus = new EventBus<TestEvents>((error, name) =>
      reported.push(`${name}: ${(error as Error).message}`),
    );
    let reached = false;
    for (const message of ["one", "two"]) {
      bus.on("closed", () => {
        throw new Error(message);
      });
    }
    bus.on("closed", () => {
      reached = true;
    });
    expect(() => bus.emit("closed", undefined)).not.toThrow();
    expect(reached).toBe(true);
    expect(reported).toEqual(["closed: one", "closed: two"]);
  });

  it("calls a listener added during an event from the next event on", () => {
    const bus = new EventBus<TestEvents>();
    let late = 0;
    bus.on("closed", () => {
      bus.on("closed", () => late++);
    });
    bus.emit("closed", undefined);
    expect(late).toBe(0);
    bus.emit("closed", undefined);
    expect(late).toBe(1);
  });

  it("drops every listener on clear", () => {
    const bus = new EventBus<TestEvents>();
    let count = 0;
    bus.on("closed", () => count++);
    bus.clear();
    bus.emit("closed", undefined);
    expect(count).toBe(0);
  });
});
