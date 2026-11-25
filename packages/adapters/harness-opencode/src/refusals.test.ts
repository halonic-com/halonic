import type { SandboxSession } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { opencodeRefusal } from "./refusals.ts";

const fenced: SandboxSession["fence"] = { state: "fenced" };

verifies("harness-opencode.refusals", () => {
  describe("opencodeRefusal", () => {
    it("lets a fenced in-sandbox agent on Linux start", () => {
      const check = {
        task: { asks: "in-sandbox" as const },
        session: { fence: fenced },
        platform: "linux",
      };
      expect(opencodeRefusal(check)).toBeUndefined();
    });

    it.each(["darwin", "win32"])("refuses on %s", (platform) => {
      const check = { task: { asks: "in-sandbox" as const }, session: { fence: fenced }, platform };
      expect(opencodeRefusal(check)).toMatch(/only on Linux/);
    });

    it("refuses an agent that asks first", () => {
      const check = { task: {}, session: { fence: fenced }, platform: "linux" };
      expect(opencodeRefusal(check)).toMatch(/`asks: in-sandbox`/);
    });

    it.each([
      [
        { state: "not-fenced", reason: "the canary answered" },
        /isn't fenced: the canary answered$/,
      ],
      [{ state: "off" }, /isn't fenced\.$/],
      [{ state: "stopped" }, /isn't fenced\.$/],
    ] as const)("refuses a session that is %o", (fence, reason) => {
      const check = {
        task: { asks: "in-sandbox" as const },
        session: { fence },
        platform: "linux",
      };
      expect(opencodeRefusal(check)).toMatch(reason);
    });
  });
});
