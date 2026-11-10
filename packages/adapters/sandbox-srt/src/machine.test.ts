import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { systemMachine } from "./machine.ts";

/** Runs a program and says whether it exited with code 0. */
function succeeds(file: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 5000 }, (error) => resolve(error === null));
  });
}

verifies("sandbox-srt.check", () => {
  describe("systemMachine", () => {
    it("answers every probe with a yes or no on this machine, and never throws", async () => {
      const answers = [
        await systemMachine.insideContainer(),
        await systemMachine.hasBubblewrap(),
        await systemMachine.userNamespacesRestricted(),
        await systemMachine.hasSeatbelt(),
      ];
      expect(answers.map((answer) => typeof answer)).toEqual([
        "boolean",
        "boolean",
        "boolean",
        "boolean",
      ]);
    });

    it("agrees with an independent user namespace check when bubblewrap is there", async () => {
      const restricted = await systemMachine.userNamespacesRestricted();
      if (process.platform !== "linux" || !(await systemMachine.hasBubblewrap())) {
        // Nothing to compare with here; CI on Linux has bubblewrap.
        expect(typeof restricted).toBe("boolean");
        return;
      }
      // Ubuntu 24.04 refuses `unshare` but lets bubblewrap through its own AppArmor
      // profile, so `unshare` is only a fair witness when that setting is off or missing.
      const setting = await readFile(
        "/proc/sys/kernel/apparmor_restrict_unprivileged_userns",
        "utf8",
      ).catch(() => "");
      const allowed =
        setting.trim() === "1"
          ? await succeeds("bwrap", ["--ro-bind", "/", "/", "--unshare-user", "--", "true"])
          : await succeeds("unshare", ["-U", "true"]);
      expect(restricted).toBe(!allowed);
    });

    it("names the platform Node runs on", () => {
      expect(systemMachine.platform).toBe(process.platform);
    });
  });
});
