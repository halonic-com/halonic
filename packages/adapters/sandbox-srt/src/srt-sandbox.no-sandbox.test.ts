import { sandboxUnavailableReasons } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Machine } from "./machine.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { endedProgram, linux } from "./srt-session.test-helper.ts";

/** The sandbox on a machine that is `linux` with `overrides`, with a runner that runs nothing for real. */
function srt(overrides: Partial<Machine>): SrtSandbox {
  return new SrtSandbox({ ...linux, ...overrides }, { run: async () => endedProgram(0) });
}

verifies("sandbox-srt.check", () => {
  describe("SrtSandbox.check on a computer with no sandbox", () => {
    // A workspace connector starts unfenced only for a listed reason, and an
    // `other` is retried, then refused (HAL-17790, D45). A computer that has
    // no sandbox at all must say so with a listed reason (HAL-17860).
    it.each([
      [
        "macOS without sandbox-exec",
        { platform: "darwin" as const, hasSeatbelt: async () => false },
      ],
      ["a platform srt has no sandbox for", { platform: "freebsd" as const }],
    ])("gives a listed reason, not `other`, on %s", async (_machine, overrides) => {
      const check = await srt(overrides).check();
      expect(check.ok).toBe(false);
      expect(check.reason).toBe("not-supported");
      expect(sandboxUnavailableReasons).toContain(check.reason);
      expect(check.missing).toHaveLength(1);
    });
  });
});
