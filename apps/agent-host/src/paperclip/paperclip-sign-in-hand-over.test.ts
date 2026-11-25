import { ManualClock, MemoryScheduler } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { handOverLimitMs, PaperclipSignIn, signInLimitMs } from "./paperclip-sign-in.ts";
import { FakeKeyStore, FakeSignInCalls, fakeBoardKey } from "./sign-in-calls.test-helper.ts";

const connection = {
  address: "https://paperclip.acme.test",
  companyId: "acme",
  workspace: "/work/acme",
  name: "acme",
};

function setUp() {
  const calls = new FakeSignInCalls();
  const keyStore = new FakeKeyStore();
  const clock = new ManualClock();
  let flow: PaperclipSignIn | undefined;
  const scheduler = new MemoryScheduler(
    { onTimer: async (timer) => flow?.onTimer(timer), onTick: async () => undefined },
    clock,
  );
  flow = new PaperclipSignIn({ callsFor: () => calls, keyStore, scheduler, clock });
  return { calls, keyStore, clock, scheduler, flow };
}

/** A sign-in the board approved, whose key the poll's answer just handed to Studio. */
async function handedOver(setup: ReturnType<typeof setUp>): Promise<string> {
  const started = await setup.flow.start(connection);
  setup.calls.statuses = ["approved"];
  expect(await setup.flow.poll(started.signInId)).toMatchObject({ status: "connected" });
  return started.signInId;
}

const dropped = [{ entry: { ...connection, key: fakeBoardKey }, saved: { createdFile: false } }];

verifies("agent-host.paperclip-sign-in", () => {
  describe("PaperclipSignIn after the approved answer", () => {
    it("revokes and drops a key Studio doesn't confirm within the limit", async () => {
      const setup = setUp();
      const { calls, keyStore, clock, scheduler, flow } = setup;
      const signInId = await handedOver(setup);
      clock.advance(handOverLimitMs - 1);
      await scheduler.runDue();
      expect(flow.holdsKey(signInId)).toBe(true);
      expect(calls.revoked).toEqual([]);
      clock.advance(1);
      await scheduler.runDue();
      expect(flow.holdsKey(signInId)).toBe(false);
      expect(calls.revoked).toEqual([fakeBoardKey]);
      expect(keyStore.dropped).toEqual(dropped);
      expect(await flow.confirm(signInId)).toBe(false);
    });

    it("keeps a key Studio confirms, with no timer left", async () => {
      const setup = setUp();
      const { calls, keyStore, clock, scheduler, flow } = setup;
      const signInId = await handedOver(setup);
      expect(await flow.confirm(signInId)).toBe(true);
      clock.advance(signInLimitMs);
      await scheduler.runDue();
      expect(await scheduler.pending("paperclip-sign-in")).toEqual([]);
      expect(calls.revoked).toEqual([]);
      expect(keyStore.dropped).toEqual([]);
    });

    it("revokes and drops the key at once when Studio cancels instead", async () => {
      const setup = setUp();
      const { calls, keyStore, flow } = setup;
      const signInId = await handedOver(setup);
      expect(await flow.cancel(signInId)).toEqual({ status: "cancelled" });
      expect(flow.holdsKey(signInId)).toBe(false);
      expect(calls.revoked).toEqual([fakeBoardKey]);
      expect(keyStore.dropped).toEqual(dropped);
    });

    it("says the key may work when its revoke fails, and still drops it", async () => {
      const setup = setUp();
      const { calls, keyStore, flow } = setup;
      const signInId = await handedOver(setup);
      calls.revokeCurrent = async () => {
        throw new Error("offline");
      };
      expect(await flow.cancel(signInId)).toEqual({ status: "cancelled", keyMayWork: true });
      expect(keyStore.dropped).toEqual(dropped);
    });
  });

  describe("PaperclipSignIn with a sign-in nobody polled", () => {
    it("holds nothing for it once it expired, when the next sign-in starts", async () => {
      const { clock, scheduler, flow } = setUp();
      const first = await flow.start(connection);
      clock.advance(signInLimitMs);
      await scheduler.runDue();
      const next = await flow.start(connection);
      expect(flow.holdsKey(first.signInId)).toBe(false);
      expect(flow.holdsKey(next.signInId)).toBe(true);
    });
  });
});
