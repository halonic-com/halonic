import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import type { Cast } from "./asciicast.ts";
import { echoRecording } from "./fixtures.test-helper.ts";
import { paceCast, seededRandom, typingSchedule } from "./pace.ts";

/** `echo hi` as the capture saw it: the program took 1.4 s to print. */
const capture: Cast = {
  header: { version: 2, width: 20, height: 3 },
  events: [
    { time: 0, kind: "o", data: "~ $ " },
    { time: 0, kind: "m", data: "echo hi" },
    { time: 0, kind: "o", data: "echo hi\r\n" },
    { time: 1.4, kind: "o", data: "hi\r\n" },
    { time: 1.5, kind: "o", data: "\r\n~ $ " },
  ],
};

verifies("recording.pacing", () => {
  describe("paceCast", () => {
    test("types the command over its typing time and cuts the wait for output", () => {
      const paced = paceCast(capture, echoRecording());
      const typed = paced.events.filter((event) => event.kind === "o" && event.data.length === 1);
      expect(typed.map((event) => event.data).join("")).toBe("echo hi");
      expect(typed[0]?.time).toBe(0.4);
      expect(paced.events.find((event) => event.data === "\r\n")?.time).toBe(1.1);
      expect(paced.events.find((event) => event.data === "hi\r\n")?.time).toBe(1.4);
      expect(paced.events.find((event) => event.data === "\r\n~ $ ")?.time).toBe(1.5);
      expect(paced.header.duration).toBe(4.5);
    });

    test("keeps every output text as captured", () => {
      const paced = paceCast(capture, echoRecording());
      const text = (cast: Cast): string =>
        cast.events
          .filter((event) => event.kind === "o")
          .map((event) => event.data)
          .join("");
      expect(text(paced)).toBe(text(capture));
    });

    test("keeps a short wait for output as it was", () => {
      const paced = paceCast(
        capture,
        echoRecording({ commands: [{ run: "echo hi", typing: 0.7, hold: 1 }] }),
      );
      expect(paced.events.find((event) => event.data === "hi\r\n")?.time).toBe(2.5);
    });

    test("refuses a capture whose echoed line isn't the marked command", () => {
      const altered: Cast = {
        ...capture,
        events: capture.events.map((event) =>
          event.data === "echo hi\r\n" ? { ...event, data: "echo ho\r\n" } : event,
        ),
      };
      expect(() => paceCast(altered, echoRecording())).toThrow(/doesn't echo "echo hi"/);
    });

    test("refuses a capture with a different number of commands", () => {
      const recording = echoRecording({
        commands: [
          { run: "echo hi", typing: 1, hold: 1 },
          { run: "echo again", typing: 1, hold: 1 },
        ],
      });
      expect(() => paceCast(capture, recording)).toThrow(/1 commands, the recording 2/);
    });
  });

  describe("typingSchedule", () => {
    test("starts at once, gets later every time, and leaves the last gap before Enter", () => {
      const times = typingSchedule(10, 2, seededRandom(7));
      expect(times[0]).toBe(0);
      for (let index = 1; index < times.length; index += 1) {
        expect(times[index]).toBeGreaterThan(times[index - 1] ?? 0);
      }
      expect(times.at(-1)).toBeLessThan(2);
    });

    test("gives the same schedule for the same seed", () => {
      expect(typingSchedule(5, 1, seededRandom(3))).toEqual(typingSchedule(5, 1, seededRandom(3)));
    });
  });
});
