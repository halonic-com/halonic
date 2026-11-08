import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { hasPendingSignInExpired, pendingSignInLifetimeMs } from "./pending-sign-in.ts";

const startedAt = new Date(Date.UTC(2026, 10, 8, 12, 0, 0));
const after = (milliseconds: number) => new Date(startedAt.getTime() + milliseconds);

verifies("google-setup.sign-in-expiry", () => {
  it("lasts 10 minutes", () => {
    expect(pendingSignInLifetimeMs).toBe(600_000);
  });

  it("is still valid just before 10 minutes and expired from 10 minutes on", () => {
    expect(hasPendingSignInExpired({ startedAt }, startedAt)).toBe(false);
    expect(hasPendingSignInExpired({ startedAt }, after(599_999))).toBe(false);
    expect(hasPendingSignInExpired({ startedAt }, after(600_000))).toBe(true);
    expect(hasPendingSignInExpired({ startedAt }, after(3_600_000))).toBe(true);
  });
});
