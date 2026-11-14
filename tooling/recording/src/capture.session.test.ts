import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, test } from "vitest";
import { captureSession } from "./capture.ts";
import { echoRecording } from "./fixtures.test-helper.ts";

const folders: string[] = [];

/** A folder holding a stand-in `halonic`: a shell script with the given body. */
function binWith(body: string): string {
  const folder = mkdtempSync(join(tmpdir(), "halonic-recording-bin-"));
  folders.push(folder);
  const program = join(folder, "halonic");
  writeFileSync(program, `#!/bin/sh\n${body}\n`);
  chmodSync(program, 0o755);
  return folder;
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const halonicRecording = echoRecording({
  commands: [{ run: "halonic --help", step: "1 Ask", typing: 0.7, hold: 1, maxWaitForOutput: 0.3 }],
});

verifies("recording.capture", () => {
  describe("captureSession", () => {
    test("records what the stand-in halonic printed, with the command marked", () => {
      const cast = captureSession({
        recording: halonicRecording,
        binFolder: binWith("echo 'Usage: halonic'"),
      });
      expect(cast.header.width).toBe(20);
      expect(cast.events.filter((event) => event.kind === "m")).toEqual([
        expect.objectContaining({ data: "halonic --help" }),
      ]);
      const shown = cast.events.map((event) => event.data).join("");
      expect(shown).toContain("Usage: halonic");
      // The capture's private marker must not leak into the cast.
      expect(shown).not.toContain("5179");
    });

    test("stops, naming the exit status, when a command fails", () => {
      expect(() =>
        captureSession({ recording: halonicRecording, binFolder: binWith("exit 3") }),
      ).toThrow(/A command in the session failed \(3\)/);
    });

    test("stops with the exit code when the session dies without saying why", () => {
      // The stand-in kills the driver's own bash, so no `failed` marker is ever printed.
      const killsTheSession = binWith("kill -KILL $PPID");
      expect(() =>
        captureSession({ recording: halonicRecording, binFolder: killsTheSession }),
      ).toThrow(/The captured session ended with exit code 137\./);
    });
  });
});
