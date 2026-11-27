import { ManualClock, MemoryScheduler } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { PaperclipSignIn } from "./paperclip-sign-in.ts";
import { FakeKeyStore, FakeSignInCalls, fakeBoardKey } from "./sign-in-calls.test-helper.ts";

/** A connection the workspace has no file for yet: it has no company. */
const newConnection = {
  address: "https://paperclip.acme.test",
  workspace: "/work/acme",
  name: "paperclip",
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
  return { calls, keyStore, flow };
}

verifies("agent-host.paperclip-sign-in", () => {
  describe("PaperclipSignIn for a new connection", () => {
    it("starts a challenge with no company", async () => {
      const { calls, flow } = setUp();
      const started = await flow.start(newConnection);
      expect(calls.challenges).toEqual([
        { command: started.phrase, clientName: "Halonic Studio", requestedAccess: "board" },
      ]);
    });

    it("stores the key for the approver's only company", async () => {
      const { calls, keyStore, flow } = setUp();
      const started = await flow.start(newConnection);
      calls.statuses = ["approved"];
      calls.owner = { userId: "user-ada", companyIds: ["acme"] };
      expect(await flow.poll(started.signInId)).toEqual({
        status: "connected",
        userId: "user-ada",
        companyId: "acme",
        key: fakeBoardKey,
        name: newConnection.name,
        address: newConnection.address,
        workspace: newConnection.workspace,
      });
      expect(keyStore.saved).toEqual([{ ...newConnection, companyId: "acme", key: fakeBoardKey }]);
    });

    it("refuses and revokes the key of an approver in several companies", async () => {
      const { calls, keyStore, flow } = setUp();
      const started = await flow.start(newConnection);
      calls.statuses = ["approved"];
      calls.owner = { userId: "user-ada", companyIds: ["acme", "globex"] };
      expect(await flow.poll(started.signInId)).toEqual({ status: "wrong-company" });
      expect(keyStore.saved).toEqual([]);
      expect(calls.revoked).toEqual([fakeBoardKey]);
    });
  });
});
