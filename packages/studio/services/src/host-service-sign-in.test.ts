import type { SignInConnectionRef } from "@halonicjs/ports";
import { serviceSignInContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { isApprovalPage } from "./host-service-sign-in.ts";
import { revokeCurrent, StandInPaperclipHost } from "./paperclip-host.test-helper.ts";

serviceSignInContract("HostServiceSignIn", async (setup) => {
  const host = new StandInPaperclipHost({ ...setup, now: () => setup.now().getTime() });
  return {
    signIn: host.serviceSignIn(),
    approve: () => host.approve(),
    hasKey: (connection) => host.hasKey(connection),
  };
});

const startedAt = Date.parse("2026-11-26T12:00:00.000Z");
const address = "https://paperclip.acme.example";
const acme: SignInConnectionRef = {
  service: "paperclip",
  connection: "acme",
  host: "paperclip.acme.example",
};

/** The stand-in `acme` Paperclip, and a connection file whose address can't be read. */
function standIn() {
  const host = new StandInPaperclipHost({
    connections: {
      acme: { address, company: "acme-company" },
      broken: { address: "not an address", company: "acme-company" },
    },
    approver: "Acme Board",
    now: () => startedAt,
  });
  const reported: unknown[] = [];
  return { host, signIn: host.serviceSignIn((error) => reported.push(error)), reported };
}

/** Lets the stand-in's polls go on until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  while (!done()) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A test sign-in for `acme` that the board approved and the follow kept. */
async function signedIn(stand: ReturnType<typeof standIn>) {
  const { signInId } = await started(stand.signIn);
  const followed = stand.signIn.follow(signInId, new AbortController().signal);
  stand.host.approve();
  await followed;
  return signInId;
}

async function started(signIn: ReturnType<typeof standIn>["signIn"], test = true) {
  const answer = await signIn.start(acme, { test });
  if (answer.outcome !== "started") throw new Error(`refused: ${answer.reason}`);
  return answer;
}

verifies("services.service-sign-in", () => {
  describe("Studio's ServiceSignIn", () => {
    it("opens only the approval page on the connection file's own address", async () => {
      const { host, signIn } = standIn();
      expect((await started(signIn)).approvalUrl).toBe(`${address}/cli-auth/challenge-1`);
      for (const page of [
        "https://paperclip.evil.example/cli-auth/challenge-2",
        "http://paperclip.acme.example/cli-auth/challenge-2",
        `${address}/settings/challenge-2`,
      ]) {
        host.approvalUrl = page;
        expect(await signIn.start(acme, { test: false })).toEqual({
          outcome: "refused",
          reason: "other-host",
        });
      }
    });

    it("accepts an approval page only as https, on the same origin, at /cli-auth/<id>", () => {
      expect(isApprovalPage(address, `${address}/cli-auth/abc_1?token=t`)).toBe(true);
      expect(isApprovalPage(address, `${address}:8443/cli-auth/abc`)).toBe(false);
      expect(isApprovalPage(address, `${address}/cli-auth/../admin`)).toBe(false);
      expect(isApprovalPage(address, "https://user@paperclip.acme.example/cli-auth/abc")).toBe(
        false,
      );
      expect(isApprovalPage(address, "not a page")).toBe(false);
    });

    it("caps the countdown at 10 minutes after the start, whatever the host answers", async () => {
      const { host, signIn } = standIn();
      host.expiresAt = "2026-11-26T13:00:00.000Z";
      expect((await started(signIn)).expiresAt).toBe("2026-11-26T12:10:00.000Z");
    });

    it("revokes a test sign-in with revoke-current, after which me answers 401 and the keychain is empty", async () => {
      const { host, signIn } = standIn();
      const { signInId } = await started(signIn);
      const followed = signIn.follow(signInId, new AbortController().signal);
      host.approve();
      expect(await followed).toEqual({
        outcome: "signed-in",
        account: { service: "paperclip", name: "Acme Board" },
      });
      expect(host.me("acme")).toBe(200);
      expect(await signIn.revokeTest(signInId)).toEqual({ outcome: "revoked" });
      expect(host.requests).toContain(revokeCurrent);
      expect(host.me("acme")).toBe(401);
      expect(host.keychain.size).toBe(0);
    });

    it("keeps no key when the stepper closes before the approval, during the write or after the confirm", async () => {
      for (const closes of ["before", "write", "confirm"] as const) {
        const { host, signIn } = standIn();
        const { signInId } = await started(signIn);
        const closed = new AbortController();
        if (closes === "write") host.onKeyWritten = () => closed.abort();
        if (closes === "confirm") host.onConfirmed = () => closed.abort();
        const followed = signIn.follow(signInId, closed.signal);
        if (closes === "before") closed.abort();
        host.approve();
        expect(await followed).toEqual({ outcome: "cancelled" });
        expect(host.keychain.size).toBe(0);
        expect(host.me("acme")).toBe(401);
      }
    });

    it("keeps no key when a sign-in nobody follows is cancelled after the confirm", async () => {
      const { host, signIn } = standIn();
      const { signInId } = await started(signIn);
      let cancelled: Promise<void> | undefined;
      host.onConfirmed = () => {
        cancelled = signIn.cancel(signInId);
      };
      host.approve();
      await until(() => cancelled !== undefined);
      await cancelled;
      expect(host.keychain.size).toBe(0);
      expect(host.me("acme")).toBe(401);
    });

    it("answers cancelled for a sign-in it doesn't know or a stepper already closed", async () => {
      const { signIn } = standIn();
      expect(await signIn.follow("acme-9", new AbortController().signal)).toEqual({
        outcome: "cancelled",
      });
      await signIn.cancel("acme-9");
      const { signInId } = await started(signIn);
      expect(await signIn.follow(signInId, AbortSignal.abort())).toEqual({ outcome: "cancelled" });
    });

    it("passes on the host's refusals and a connection file with no readable address", async () => {
      const { host, signIn } = standIn();
      expect(await signIn.start({ ...acme, connection: "broken" }, { test: false })).toEqual({
        outcome: "refused",
        reason: "other-host",
      });
      expect(await signIn.whoAmI({ ...acme, connection: "other" })).toBeUndefined();
      for (const [answer, reason] of [
        ["address-not-allowed", "other-host"],
        ["unreachable", "unreachable"],
        ["too-many-sign-ins", "too-many-sign-ins"],
      ] as const) {
        host.refuseStart = answer;
        expect(await signIn.start(acme, { test: false })).toEqual({ outcome: "refused", reason });
      }
    });

    it("ends expired, wrong-company or cancelled as the host says", async () => {
      for (const status of ["expired", "wrong-company", "cancelled"] as const) {
        const { host, signIn } = standIn();
        const { signInId } = await started(signIn);
        const followed = signIn.follow(signInId, new AbortController().signal);
        host.end(status);
        expect(await followed).toEqual({ outcome: status });
      }
    });

    it("names the connection's label when Paperclip doesn't say whom the key is for", async () => {
      const stand = standIn();
      stand.host.showsUserName = false;
      await signedIn(stand);
      expect(await stand.signIn.whoAmI(acme)).toEqual({
        service: "paperclip",
        name: "Paperclip · Acme",
      });
    });

    it("says when a test key may still work, or the host couldn't be asked", async () => {
      const notRevoked = standIn();
      const first = await signedIn(notRevoked);
      notRevoked.host.disconnectGoes = "not-revoked";
      expect(await notRevoked.signIn.revokeTest(first)).toEqual({ outcome: "still-works" });
      const unreachable = standIn();
      const second = await signedIn(unreachable);
      unreachable.host.disconnectGoes = "fails";
      expect(await unreachable.signIn.revokeTest(second)).toEqual({ outcome: "unreachable" });
      expect(unreachable.reported).toHaveLength(1);
      expect(unreachable.host.keychain.size).toBe(0);
    });
  });
});
