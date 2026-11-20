import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { NobodyPaired } from "./nobody-paired.ts";

verifies("agent-host.remote-gateway", () => {
  describe("until pairing exists", () => {
    it("opens no pairing and knows no phone", () => {
      const host = new NobodyPaired();
      expect(host.begin()).toEqual({
        kind: "refused",
        refusal: { reason: "code-ended", triesLeft: 0 },
      });
      expect(host.isPaired()).toBe(false);
      expect(() => host.connected()).toThrow();
    });

    it("gives a copy of a 32-byte host key that stays the same for the launch", () => {
      const host = new NobodyPaired();
      const first = host.hostPrivateKey();
      first.fill(0);
      expect(host.hostPrivateKey()).toHaveLength(32);
      expect(host.hostPrivateKey()).toEqual(host.hostPrivateKey());
      expect(host.hostPrivateKey().some((byte) => byte !== 0)).toBe(true);
    });
  });
});
