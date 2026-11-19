import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, test } from "vitest";
import { formatCast } from "../asciicast.ts";
import { echoRecording } from "../fixtures.test-helper.ts";

const script = join(import.meta.dirname, "record.ts");
const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A folder holding a capture of `echoRecording`, as `capture` would have saved it. */
function captureFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "halonic-recording-cli-"));
  folders.push(folder);
  const recording = echoRecording({ title: "Terminal · Halonic {version}" });
  writeFileSync(join(folder, "echo.json"), JSON.stringify(recording));
  writeFileSync(join(folder, "echo.version"), "Halonic 0.1.0\n");
  const cast = formatCast({
    header: { version: 2, width: 20, height: 3 },
    events: [
      { time: 0, kind: "o", data: "~ $ " },
      { time: 0.1, kind: "m", data: "echo hi" },
      { time: 0.1, kind: "o", data: "echo hi\r\n" },
      { time: 0.2, kind: "o", data: "hi\r\n\r\n~ $ " },
    ],
  });
  writeFileSync(join(folder, "echo.cast"), cast);
  return folder;
}

function record(...args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

verifies("recording.svg", () => {
  describe("record.ts", () => {
    test("render writes the paced cast, the animated SVG and the still next to the capture", () => {
      const folder = captureFolder();
      const result = record("render", "--dir", folder, "--recording", join(folder, "echo.json"));
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("✓ Rendered echo.svg (");
      expect(readFileSync(join(folder, "echo.svg"), "utf8")).toContain("Terminal · Halonic 0.1.0");
      expect(readFileSync(join(folder, "echo-still.svg"), "utf8")).toContain(">hi</tspan>");
      expect(readFileSync(join(folder, "echo.paced.cast"), "utf8")).toContain('"duration":4.2');
    });

    test("says in one line what stopped the render, without a stack trace", () => {
      const folder = captureFolder();
      rmSync(join(folder, "echo.version"));
      const result = record("render", "--dir", folder, "--recording", join(folder, "echo.json"));
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/^✕ There is no saved version next to the cast\./);
      expect(result.stderr).not.toContain("    at ");
    });

    test("shows how to use it when the command or a folder is missing", () => {
      expect(record("render").status).toBe(2);
      expect(record("capture", "--dir", "out").stderr).toContain("Usage: record.ts capture");
      expect(record("draw", "--dir", "out").status).toBe(2);
    });
  });
});
