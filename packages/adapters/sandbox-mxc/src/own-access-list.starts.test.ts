import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";

// Every program the access list starts goes through this fake, so the test
// sees each one and nothing really runs.
const started = vi.hoisted(() => [] as { file: string; args: string[] }[]);
vi.mock("node:child_process", () => ({
  execFile: (
    file: string,
    args: string[],
    _options: unknown,
    done: (error: null, stdout: string, stderr: string) => void,
  ) => {
    started.push({ file, args });
    done(null, '"acme\\\\builder","S-1-5-21-1111-2222-3333-1001"', "");
  },
}));

const { giveOwnAccessList } = await import("./own-access-list.ts");

verifies("sandbox-mxc.box-folders", () => {
  describe("what the box folders' access list starts", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("is only whoami.exe and icacls.exe from the system folder, never a skill's scripts (HAL-13373)", async () => {
      vi.stubEnv("SystemRoot", "system");
      await giveOwnAccessList("acme-boxes");
      expect(started.map((s) => s.file)).toEqual([
        "system\\System32\\whoami.exe",
        "system\\System32\\icacls.exe",
      ]);
      expect(started.flatMap((s) => s.args).some((arg) => /scripts/i.test(arg))).toBe(false);
    });
  });
});
