import type {
  ServiceSignIn,
  SignInConnection,
  SignInConnectionRef,
  SignInStart,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** What the suite gives a sign-in under test: connection files, the keys already kept and the approver. */
export interface ServiceSignInSetup {
  connections: Readonly<Record<string, SignInConnection>>;
  /** The connections that already have a key in the keychain, which Paperclip takes. */
  keys: readonly string[];
  /**
   * The connections whose keychain entry was signed in from another workspace: the agent host
   * doesn't hold it, but a sign-in would write over it.
   */
  shellOnly: readonly string[];
  /** The connections whose kept key Paperclip no longer takes. */
  signedOut: readonly string[];
  /** The account name the stand-in board approves as. */
  approver: string;
  /** The injected clock. */
  now: () => Date;
}

/** A sign-in under test, with the stand-in board and the keychain it writes to. */
export interface ServiceSignInHarness {
  signIn: ServiceSignIn;
  /** The stand-in board clicks Approve on the sign-in's page. */
  approve: (signInId: string) => void;
  /** Whether the keychain holds a key for the connection. */
  hasKey: (connection: string) => boolean;
}

/** Creates a new sign-in for one test, wired to the setup's stand-in Paperclip and keychain. */
export type MakeServiceSignIn = (setup: ServiceSignInSetup) => Promise<ServiceSignInHarness>;

const now = new Date("2026-11-26T12:00:00.000Z");
const acmeFile = { address: "https://paperclip.acme.example", company: "acme-company" };
const acme: SignInConnectionRef = {
  service: "paperclip",
  connection: "acme",
  host: "paperclip.acme.example",
};
const setup: ServiceSignInSetup = {
  connections: { acme: acmeFile, kept: acmeFile, elsewhere: acmeFile, stale: acmeFile },
  keys: ["kept"],
  shellOnly: ["elsewhere"],
  signedOut: ["stale"],
  approver: "Acme Board",
  now: () => now,
};

async function started(harness: ServiceSignInHarness, test: boolean) {
  const answer = await harness.signIn.start(acme, { test });
  if (answer.outcome !== "started") throw new Error(`the sign-in didn't start: ${answer.reason}`);
  return answer;
}

/** The same connection reference, for the connection file `connection`. */
const on = (connection: string): SignInConnectionRef => ({ ...acme, connection });

const refused = (reason: string): SignInStart => ({ outcome: "refused", reason }) as SignInStart;

/** Lets the stand-in's pending answers arrive. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * The contract every {@link ServiceSignIn} passes: the fake now, Studio's
 * own over the agent host's sign-in in the next pull request. It needs no
 * network: a sign-in is given a harness wired to a stand-in Paperclip, board
 * and keychain.
 */
export function serviceSignInContract(name: string, make: MakeServiceSignIn): void {
  verifies("contracts.service-sign-in", () => {
    describe(`ServiceSignIn contract: ${name}`, () => {
      startCases(make);
      followCases(make);
      testCases(make);
    });
  });
}

function startCases(make: MakeServiceSignIn): void {
  it("reads the connection file, and refuses a missing file, another host or a test over a kept key", async () => {
    const { signIn } = await make(setup);
    expect(await signIn.connection(acme)).toEqual(acmeFile);
    expect(await signIn.connection({ ...acme, connection: "other" })).toBeUndefined();
    expect(await signIn.start({ ...acme, connection: "other" }, { test: false })).toEqual(
      refused("no-connection"),
    );
    expect(
      await signIn.start({ ...acme, host: "paperclip.evil.example" }, { test: false }),
    ).toEqual(refused("other-host"));
    expect(await signIn.start({ ...acme, connection: "kept" }, { test: true })).toEqual(
      refused("already-signed-in"),
    );
  });

  it("refuses a sign-in that would write over a kept key, and keeps that key", async () => {
    const harness = await make(setup);
    const { signIn } = harness;
    // An entry signed in from another workspace counts, though the host doesn't hold it.
    for (const test of [true, false]) {
      expect(await signIn.start(on("elsewhere"), { test })).toEqual(refused("already-signed-in"));
    }
    expect(await signIn.start(on("kept"), { test: false })).toEqual(refused("already-signed-in"));
    expect(await signIn.start(on("stale"), { test: true })).toEqual(refused("already-signed-in"));
    expect(harness.hasKey("elsewhere")).toBe(true);
    expect(harness.hasKey("kept")).toBe(true);
  });

  it("signs in again over a key Paperclip no longer takes", async () => {
    const { signIn } = await make(setup);
    expect((await signIn.start(on("stale"), { test: false })).outcome).toBe("started");
  });

  it("starts with a code, an approval page on the connection's own address and at most 10 minutes", async () => {
    const answer = await started(await make(setup), false);
    expect(answer.code).not.toBe("");
    expect(answer.approvalUrl.startsWith(`${acmeFile.address}/cli-auth/`)).toBe(true);
    const lasts = Date.parse(answer.expiresAt) - now.getTime();
    expect(lasts).toBeGreaterThan(0);
    expect(lasts).toBeLessThanOrEqual(10 * 60 * 1000);
  });
}

function followCases(make: MakeServiceSignIn): void {
  it("ends signed in with the approver's name once approved, and keeps the key", async () => {
    const harness = await make(setup);
    const { signInId } = await started(harness, false);
    const followed = harness.signIn.follow(signInId, new AbortController().signal);
    harness.approve(signInId);
    const account = { service: "paperclip", name: "Acme Board" };
    expect(await followed).toEqual({ outcome: "signed-in", account });
    expect(harness.hasKey("acme")).toBe(true);
    expect(await harness.signIn.whoAmI(acme)).toEqual(account);
  });

  it("leaves no key when the follow is aborted, before or right after the approval", async () => {
    for (const approveFirst of [false, true]) {
      const harness = await make(setup);
      const { signInId } = await started(harness, false);
      const closed = new AbortController();
      const followed = harness.signIn.follow(signInId, closed.signal);
      if (approveFirst) harness.approve(signInId);
      closed.abort();
      expect((await followed).outcome).toBe("cancelled");
      await settle();
      expect(harness.hasKey("acme")).toBe(false);
      expect(await harness.signIn.whoAmI(acme)).toBeUndefined();
    }
  });

  it("leaves no key when a sign-in nobody follows is cancelled", async () => {
    const harness = await make(setup);
    const { signInId } = await started(harness, false);
    await harness.signIn.cancel(signInId);
    harness.approve(signInId);
    await settle();
    expect(harness.hasKey("acme")).toBe(false);
  });
}

function testCases(make: MakeServiceSignIn): void {
  it("revokes a test sign-in's key and removes it from the keychain", async () => {
    const harness = await make(setup);
    const { signInId } = await started(harness, true);
    const followed = harness.signIn.follow(signInId, new AbortController().signal);
    harness.approve(signInId);
    await followed;
    expect(await harness.signIn.revokeTest(signInId)).toEqual({ outcome: "revoked" });
    expect(harness.hasKey("acme")).toBe(false);
    expect(await harness.signIn.whoAmI(acme)).toBeUndefined();
  });

  it("revokes nothing for a sign-in that isn't a finished test", async () => {
    const harness = await make(setup);
    const { signInId } = await started(harness, false);
    const followed = harness.signIn.follow(signInId, new AbortController().signal);
    harness.approve(signInId);
    await followed;
    expect(await harness.signIn.revokeTest(signInId)).toEqual({ outcome: "not-a-test" });
    expect(await harness.signIn.revokeTest("sign-in-unknown")).toEqual({ outcome: "not-a-test" });
    expect(harness.hasKey("acme")).toBe(true);
  });
}
