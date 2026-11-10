import type { HarnessEvent } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { RunEvents } from "./run-events.ts";

const called: HarnessEvent = { type: "tool.called", agent: "writer", tool: "shell", args: {} };
const finished: HarnessEvent = { type: "agent.finished", agent: "writer", output: "Teal." };

/** Reads `events` to their end: what was read, and the error they ended with, if any. */
async function readAll(events: RunEvents): Promise<{ read: HarnessEvent[]; error?: unknown }> {
  const read: HarnessEvent[] = [];
  try {
    for await (const event of events) read.push(event);
  } catch (error) {
    return { read, error };
  }
  return { read };
}

verifies("harness-codex.run-events", () => {
  describe("RunEvents", () => {
    it("gives the events pushed before and while it is read, in order, then ends", async () => {
      const events = new RunEvents();
      events.push([called]);
      const reading = readAll(events);
      await Promise.resolve();
      events.push([finished]);
      events.end();

      expect(await reading).toEqual({ read: [called, finished] });
    });

    it("gives the waiting events before the error it ends with", async () => {
      const events = new RunEvents();
      events.push([called]);
      events.fail(new Error("Codex stopped"));

      const { read, error } = await readAll(events);
      expect(read).toEqual([called]);
      expect(String(error)).toBe("Error: Codex stopped");
    });

    it("keeps the first ending, and drops what comes after it", async () => {
      const events = new RunEvents();
      events.end();
      events.fail(new Error("too late"));
      events.push([called]);

      expect(events.ended).toBe(true);
      expect(await readAll(events)).toEqual({ read: [] });
    });

    it("wakes a reader that waits, when it ends", async () => {
      const events = new RunEvents();
      const reading = readAll(events);
      await Promise.resolve();
      expect(events.ended).toBe(false);
      events.fail(new Error("cancelled"));

      expect(String((await reading).error)).toBe("Error: cancelled");
    });
  });
});
