import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import type { Cast } from "./asciicast.ts";
import { echoRecording } from "./fixtures.test-helper.ts";
import { renderRecording } from "./render.ts";

/** What the capture of `echoRecording` looks like: the prompt, the marked command, its output. */
const capture: Cast = {
  header: { version: 2, width: 20, height: 3 },
  events: [
    { time: 0, kind: "o", data: "~ $ " },
    { time: 0.1, kind: "m", data: "echo hi" },
    { time: 0.1, kind: "o", data: "echo hi\r\n" },
    { time: 2.5, kind: "o", data: "hi\r\n" },
    { time: 2.6, kind: "o", data: "\r\n~ $ " },
  ],
};

const recording = echoRecording({ title: "Terminal · Halonic {version}" });

verifies("recording.svg", () => {
  describe("renderRecording", () => {
    test("fills the window bar's version from what the captured halonic --version printed", () => {
      const rendered = renderRecording({ capture, recording, versionOutput: "Halonic 0.1.0\n" });
      expect(rendered.animated).toContain(">Terminal · Halonic 0.1.0</text>");
      expect(rendered.still).toContain(">Terminal · Halonic 0.1.0</text>");
    });

    test("paces the capture and lights the step label when its command is typed", () => {
      const rendered = renderRecording({ capture, recording, versionOutput: "Halonic 0.1.0\n" });
      // The 2.4 s start-up wait is cut to maxWaitForOutput (0.3 s); the rest is 3 s.
      expect(rendered.paced.header.duration).toBe(4.5);
      expect(rendered.animated).toContain(
        "{0%{fill:#8196b6}8.889%{fill:#e6edf7}33.333%{fill:#e6edf7}}",
      );
      expect(rendered.still).toContain('class="t l">1 Say</text>');
    });

    test("stops when the capture saved no version", () => {
      expect(() => renderRecording({ capture, recording, versionOutput: undefined })).toThrow(
        /There is no saved version next to the cast/,
      );
    });

    test("stops when the saved version isn't Halonic and a version", () => {
      expect(() => renderRecording({ capture, recording, versionOutput: "0.1.0\n" })).toThrow(
        '"halonic --version" printed "0.1.0", not "Halonic" and a version.',
      );
    });
  });
});
