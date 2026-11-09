import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KeyedQueue } from "./keyed-queue.ts";

/** A promise and the function that resolves it, so a test decides when work ends. */
function gate(): { opened: Promise<void>; open: () => void } {
  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

verifies("std.keyed-queue", () => {
  it("starts work for a key only after the work before it has settled", async () => {
    const queue = new KeyedQueue();
    const steps: string[] = [];
    const first = gate();
    const a = queue.run("run-1", async () => {
      steps.push("a starts");
      await first.opened;
      steps.push("a ends");
      return "a";
    });
    const b = queue.run("run-1", async () => {
      steps.push("b starts");
      return "b";
    });
    await Promise.resolve();
    expect(steps).toEqual(["a starts"]);
    first.open();
    expect(await Promise.all([a, b])).toEqual(["a", "b"]);
    expect(steps).toEqual(["a starts", "a ends", "b starts"]);
  });

  it("runs work for different keys side by side", async () => {
    const queue = new KeyedQueue();
    const first = gate();
    const a = queue.run("run-1", () => first.opened.then(() => "a"));
    expect(await queue.run("run-2", async () => "b")).toBe("b");
    first.open();
    expect(await a).toBe("a");
  });

  it("gives a failure to its own caller and goes on with the next work", async () => {
    const queue = new KeyedQueue();
    const failing = queue.run("run-1", async () => {
      throw new Error("disk full");
    });
    const next = queue.run("run-1", async () => "next");
    await expect(failing).rejects.toThrow("disk full");
    expect(await next).toBe("next");
  });

  it("forgets a key once its work is done", async () => {
    const queue = new KeyedQueue();
    const work = queue.run("run-1", async () => "a");
    expect(queue.busyKeys).toBe(1);
    await work;
    await Promise.resolve();
    expect(queue.busyKeys).toBe(0);
  });
});
