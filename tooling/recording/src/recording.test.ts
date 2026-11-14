import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { parseRecording } from "./recording.ts";

const valid = {
  title: "Terminal · acme",
  alt: "A terminal.",
  columns: 80,
  rows: 24,
  startDelay: 0.4,
  rest: 3,
  seed: 1,
  commands: [
    { run: "halonic init --example acme", step: "1 Create", typing: 1.6, hold: 2.3 },
    {
      run: "halonic runs send {run} approve",
      typing: 1.1,
      hold: 0,
      maxWaitForOutput: 0.3,
      set: { run: "printf 4a6b83" },
    },
  ],
};

function withChange(change: Record<string, unknown>): string {
  return JSON.stringify({ ...valid, ...change });
}

verifies("recording.capture", () => {
  describe("parseRecording", () => {
    test("reads a recording with its commands and pacing", () => {
      const recording = parseRecording(JSON.stringify(valid));
      expect(recording.columns).toBe(80);
      expect(recording.commands[0]).toEqual({
        run: "halonic init --example acme",
        step: "1 Create",
        typing: 1.6,
        hold: 2.3,
      });
      expect(recording.commands[1]?.set).toEqual({ run: "printf 4a6b83" });
      expect(recording.commands[1]?.maxWaitForOutput).toBe(0.3);
    });

    test("reads the README's own recording file", () => {
      const file = new URL("../recordings/first-run.json", import.meta.url);
      const recording = parseRecording(readFileSync(file, "utf8"));
      expect(recording.commands.map((command) => command.step).filter(Boolean)).toEqual([
        "1 Create",
        "2 Test",
        "3 Run",
        "4 Answer",
      ]);
    });

    test("names the field that is wrong", () => {
      expect(() => parseRecording("[]")).toThrow(/one JSON object/);
      expect(() => parseRecording(withChange({ commands: [] }))).toThrow(/at least one command/);
      expect(() => parseRecording(withChange({ title: "" }))).toThrow(/recording.title/);
      expect(() => parseRecording(withChange({ columns: 8.5 }))).toThrow(/recording.columns/);
      expect(() => parseRecording(withChange({ rest: -1 }))).toThrow(/recording.rest/);
      expect(() => parseRecording(withChange({ commands: ["echo"] }))).toThrow(
        /commands\[0\] must be an object/,
      );
    });

    test("lets a title show {version} and nothing else", () => {
      const withVersion = withChange({ title: "Terminal · Halonic {version}" });
      expect(parseRecording(withVersion).title).toBe("Terminal · Halonic {version}");
      expect(() => parseRecording(withChange({ title: "Terminal · {who}" }))).toThrow(
        /recording.title uses \{who\}/,
      );
    });

    test("refuses a {name} that set doesn't define, and a set that isn't names to commands", () => {
      const missing = withChange({ commands: [{ run: "echo {who}", typing: 1, hold: 0 }] });
      expect(() => parseRecording(missing)).toThrow(/uses \{who\}/);
      const badName = withChange({
        commands: [{ run: "echo", typing: 1, hold: 0, set: { Who: "x" } }],
      });
      expect(() => parseRecording(badName)).toThrow(/"Who" isn't a valid name/);
      const notText = withChange({
        commands: [{ run: "echo", typing: 1, hold: 0, set: { who: 1 } }],
      });
      expect(() => parseRecording(notText)).toThrow(/set.who must be a shell command/);
      const notMap = withChange({ commands: [{ run: "echo", typing: 1, hold: 0, set: "x" }] });
      expect(() => parseRecording(notMap)).toThrow(/must map names/);
    });
  });
});
