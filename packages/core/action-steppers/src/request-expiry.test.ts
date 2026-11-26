import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkRunnable, defaultRequestLifetimeMs, requestExpiresAt } from "./request-expiry.ts";

const hour = 60 * 60 * 1000;
const receivedAt = 1_000_000;

verifies("action-steppers.request-expiry", () => {
  describe("requestExpiresAt", () => {
    it("defaults to 24 hours after the request arrived", () => {
      expect(requestExpiresAt({ receivedAt })).toBe(receivedAt + defaultRequestLifetimeMs);
    });

    it("never lets the requester make it later than the default", () => {
      expect(requestExpiresAt({ receivedAt, requested: receivedAt + 72 * hour })).toBe(
        receivedAt + 24 * hour,
      );
    });

    it("lets the definition and the requester shorten it", () => {
      expect(requestExpiresAt({ receivedAt, definitionLimitMs: 2 * hour })).toBe(
        receivedAt + 2 * hour,
      );
      expect(
        requestExpiresAt({ receivedAt, definitionLimitMs: 2 * hour, requested: receivedAt + hour }),
      ).toBe(receivedAt + hour);
    });

    it("never lets the definition make it later than the default", () => {
      expect(requestExpiresAt({ receivedAt, definitionLimitMs: 48 * hour })).toBe(
        receivedAt + 24 * hour,
      );
    });
  });

  describe("checkRunnable", () => {
    const expiresAt = receivedAt + 24 * hour;

    it("runs a request before its expiry", () => {
      expect(checkRunnable({ expiresAt, finished: false }, expiresAt - 1)).toEqual({ ok: true });
    });

    it("refuses a request at or after its expiry", () => {
      expect(checkRunnable({ expiresAt, finished: false }, expiresAt)).toEqual({
        ok: false,
        reason: "expired",
      });
    });

    it("refuses a finished request even before its expiry", () => {
      expect(checkRunnable({ expiresAt, finished: true }, receivedAt)).toEqual({
        ok: false,
        reason: "closed",
      });
    });
  });
});
