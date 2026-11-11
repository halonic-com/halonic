import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";

// Every program the journal ACL starts goes through this fake, so the test
// sees each one and nothing really runs.
const started = vi.hoisted(() => [] as { file: string; args: string[] }[]);
vi.mock("node:child_process", () => ({
  execFile: (
    file: string,
    args: string[],
    _options: unknown,
    done: (error: null, stdout: string) => void,
  ) => {
    started.push({ file, args });
    done(null, '"u","S-1-5-18"');
  },
}));

const { restrictToThisUser } = await import("./journal-acl.ts");

verifies("sandbox-srt.session", () => {
  describe("what the journal ACL starts", () => {
    // Windows' own random number generator needs the real SystemRoot, so put it back.
    afterEach(() => vi.unstubAllEnvs());

    it("is only whoami.exe and icacls.exe from the system folder, never a skill's scripts (HAL-3896)", async () => {
      vi.stubEnv("SystemRoot", "system");
      await restrictToThisUser("journals");
      expect(started.map((s) => s.file.split(/[\\/]/).pop())).toEqual([
        "whoami.exe",
        "icacls.exe",
        "icacls.exe",
        "icacls.exe",
      ]);
      expect(started.every((s) => /system32/i.test(s.file))).toBe(true);
    });
  });
});
