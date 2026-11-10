import { StopSource } from "@halonicjs/std";
import { describe, expect, it } from "vitest";
import { unlessStopped } from "./unless-stopped.ts";

describe("unlessStopped", () => {
  it("gives what the work gives when nothing stops it", async () => {
    await expect(unlessStopped(new StopSource().signal, Promise.resolve(7))).resolves.toBe(7);
  });

  it("throws the stop's reason, and hands what arrives later to `late`", async () => {
    const stop = new StopSource();
    const work = Promise.withResolvers<string>();
    const late: string[] = [];

    const waiting = unlessStopped(stop.signal, work.promise, async (value) => {
      late.push(value);
    });
    stop.stop(new Error("Stopped."));
    await expect(waiting).rejects.toThrow("Stopped.");
    work.resolve("session");
    await work.promise;
    await Promise.resolve();

    expect(late).toEqual(["session"]);
  });

  it("throws at once when it was already told to stop, even for finished work", async () => {
    const stop = new StopSource();
    stop.stop(new Error("Stopped before."));

    await expect(unlessStopped(stop.signal, Promise.resolve(7))).rejects.toThrow("Stopped before.");
  });
});
