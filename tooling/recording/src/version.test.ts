import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, test } from "vitest";
import { captureVersion } from "./capture.ts";
import { titleWithVersion, versionFromOutput } from "./version.ts";

const folders: string[] = [];

/** A folder holding a stand-in `halonic`: a shell script that prints `output` and exits with `status`. */
function binWith(output: string, status: number): string {
  const folder = mkdtempSync(join(tmpdir(), "halonic-recording-bin-"));
  folders.push(folder);
  const program = join(folder, "halonic");
  writeFileSync(program, `#!/bin/sh\ncat <<'END'\n${output}\nEND\nexit ${status}\n`);
  chmodSync(program, 0o755);
  return folder;
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

verifies("recording.capture", () => {
  describe("captureVersion", () => {
    test("returns what halonic --version printed", () => {
      expect(captureVersion(binWith("Halonic 0.1.0", 0))).toBe("Halonic 0.1.0\n");
    });

    test("stops, quoting the output, when halonic has no --version", () => {
      const before1883 = binWith('✕ There\'s no command "--version".', 2);
      expect(() => captureVersion(before1883)).toThrow(
        /exit 2 and printed: ✕ There's no command "--version"\./,
      );
    });

    test("stops when halonic --version prints something that isn't a version", () => {
      expect(() => captureVersion(binWith("Usage: halonic <command>", 0))).toThrow(
        /printed "Usage: halonic <command>"/,
      );
    });
  });
});

verifies("recording.capture", () => {
  describe("titleWithVersion", () => {
    test("fills {version} from what halonic --version printed", () => {
      expect(titleWithVersion("Terminal · Halonic {version}", "Halonic 0.1.0\n")).toBe(
        "Terminal · Halonic 0.1.0",
      );
      expect(versionFromOutput("Halonic 0.2.0-rc.1")).toBe("0.2.0-rc.1");
    });

    test("refuses a saved version that isn't Halonic and a version", () => {
      expect(() => titleWithVersion("Terminal · Halonic {version}", "0.1.0")).toThrow(
        /printed "0.1.0", not "Halonic" and a version/,
      );
      expect(() => versionFromOutput("")).toThrow(/printed ""/);
    });
  });
});
