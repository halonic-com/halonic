// The fakes live in @halonicjs/testing-contracts, whose code is measured in
// this package's run (its "measuredIn"), so their contracts run here.
import { FakeServiceSignIn, serviceSignInContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

serviceSignInContract("fake", async (setup) => {
  const signIn = new FakeServiceSignIn(setup);
  return {
    signIn,
    approve: (signInId) => signIn.approve(signInId),
    hasKey: (connection) => signIn.keychain.has(connection),
  };
});

const acme = { service: "paperclip", connection: "acme", host: "paperclip.acme.example" } as const;

function fake(): FakeServiceSignIn {
  return new FakeServiceSignIn({
    connections: { acme: { address: "https://paperclip.acme.example", company: "acme-company" } },
    approver: "Acme Board",
    now: () => new Date("2026-11-26T12:00:00.000Z"),
  });
}

verifies("contracts.service-sign-in", () => {
  describe("FakeServiceSignIn", () => {
    it("ends a sign-in that reaches its limit as expired, with no key", async () => {
      const signIn = fake();
      const started = await signIn.start(acme, { test: false });
      if (started.outcome !== "started") throw new Error("not started");
      const followed = signIn.follow(started.signInId, new AbortController().signal);
      signIn.expire(started.signInId);
      expect(await followed).toEqual({ outcome: "expired" });
      signIn.approve(started.signInId);
      expect(signIn.keychain.size).toBe(0);
      expect(await signIn.follow(started.signInId, new AbortController().signal)).toEqual({
        outcome: "expired",
      });
    });

    it("cancels a follow whose stepper closed before it began, and knows no other sign-in", async () => {
      const signIn = fake();
      const started = await signIn.start(acme, { test: false });
      if (started.outcome !== "started") throw new Error("not started");
      const closed = new AbortController();
      closed.abort();
      expect(await signIn.follow(started.signInId, closed.signal)).toEqual({
        outcome: "cancelled",
      });
      const unknown = "sign-in-unknown";
      expect(await signIn.follow(unknown, closed.signal)).toEqual({ outcome: "cancelled" });
      await signIn.cancel(unknown);
      signIn.expire(unknown);
      signIn.approve(unknown);
      expect(signIn.started).toBe(1);
    });
  });
});
