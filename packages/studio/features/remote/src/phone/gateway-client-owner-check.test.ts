import type { GatewayApproval } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayScene } from "../test-support/gateway-scene.ts";
import { listedSession } from "../test-support/listed-session.ts";
import type { OwnerCheckAvailable, OwnerCheckReady } from "./gateway-client.ts";
import { ANSWER_RISKY_ON_COMPUTER } from "./view-of.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const risky: GatewayApproval = { id: "a-1", summary: "Delete 4 files", risk: "risky" };
const waiting = [listedSession({ state: "waiting", lastSeq: 1 })];

/** A live view of one waiting session asking `risky`, its list saying `answersRisky`. */
function askingRisky(ownerCheck: OwnerCheckAvailable, answersRisky: boolean): GatewayScene {
  const scene = new GatewayScene(ownerCheck);
  scene.connect();
  scene.list(waiting, answersRisky);
  scene.event("session-1", 1, { type: "approval-requested", approval: risky });
  return scene;
}

/** The shell's answer: `approval` for a strong biometric, `answer` for it or the phone's PIN. */
function ready(approval: boolean, answer = approval): OwnerCheckAvailable {
  return () => Promise.resolve({ approval, answer });
}

/** Lets the owner checks asked so far answer. */
async function answered(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

verifies("remote.phone-remote-answers", () => {
  describe("a risky approval and the owner check", () => {
    it("answers it on the phone once the switch is on and the owner check can ask", async () => {
      const scene = askingRisky(ready(true), true);
      expect(scene.client.view().openApprovals[0]?.canAnswer).toBe(false);
      await answered();
      expect(scene.client.view().openApprovals[0]).toMatchObject({
        answerOnComputer: false,
        canAnswer: true,
      });
      void scene.client.answer("session-1", "a-1", "approve");
      expect(scene.tunnel.sentOf("answer-approval")).toHaveLength(1);
    });

    it.each<[string, OwnerCheckAvailable, boolean]>([
      ["the switch is off", ready(true), false],
      ["the owner check can't ask", ready(false), true],
      ["the phone has only a PIN", ready(false, true), true],
      ["the owner check fails", () => Promise.reject(new Error("no shell")), true],
    ])("keeps it on the computer when %s", async (_, ownerCheck, answersRisky) => {
      const scene = askingRisky(ownerCheck, answersRisky);
      await answered();
      expect(scene.client.view().openApprovals[0]).toMatchObject({
        answerOnComputer: true,
        canAnswer: false,
        offReason: ANSWER_RISKY_ON_COMPUTER,
      });
      expect(await scene.client.answer("session-1", "a-1", "approve")).toEqual({
        kind: "not-sent",
        reason: "off",
      });
    });

    it("asks the owner check again every time a list arrives, and keeps it off until it answers", async () => {
      const answers = [true, false];
      const ownerCheck = vi.fn(() => {
        const approval = answers.shift() ?? false;
        return Promise.resolve({ approval, answer: true });
      });
      const scene = askingRisky(ownerCheck, true);
      await answered();
      expect(scene.client.view().openApprovals[0]?.canAnswer).toBe(true);

      // The fingerprint was removed: the next list asks again, and Approve goes off.
      scene.push(waiting, true);
      expect(scene.client.view().openApprovals[0]?.canAnswer).toBe(false);
      await answered();
      expect(ownerCheck).toHaveBeenCalledTimes(2);
      expect(scene.client.view().openApprovals[0]?.canAnswer).toBe(false);
    });

    it("never lets an older owner check answer over a newer one", async () => {
      const pending: ((ready: OwnerCheckReady) => void)[] = [];
      const ownerCheck = () =>
        new Promise<OwnerCheckReady>((resolve) => {
          pending.push(resolve);
        });
      const scene = askingRisky(ownerCheck, true);
      scene.push(waiting, true);
      pending[1]?.({ approval: false, answer: false });
      pending[0]?.({ approval: true, answer: true });
      await answered();
      expect(scene.client.view().openApprovals[0]?.canAnswer).toBe(false);
      expect(scene.client.view().answerCheck).toBe("unavailable");
    });
  });

  describe("a phone with a PIN and no strong biometric", () => {
    it("keeps Approve off for a risky approval and Inbox answers on", async () => {
      const scene = askingRisky(ready(false, true), true);
      expect(scene.client.view()).toMatchObject({ ownerCheck: "unknown", answerCheck: "unknown" });
      await answered();
      expect(scene.client.view()).toMatchObject({
        ownerCheck: "unavailable",
        answerCheck: "ready",
      });
      expect(scene.client.view().openApprovals[0]).toMatchObject({
        answerOnComputer: true,
        canAnswer: false,
      });
    });

    it.each<[string, OwnerCheckAvailable]>([
      [
        "answers that aren't booleans",
        () => Promise.resolve({ approval: "yes", answer: 1 } as never),
      ],
      ["a failed owner check", () => Promise.reject(new Error("no shell"))],
    ])("reads %s as no for both", async (_, ownerCheck) => {
      const scene = askingRisky(ownerCheck, true);
      await answered();
      expect(scene.client.view()).toMatchObject({
        ownerCheck: "unavailable",
        answerCheck: "unavailable",
      });
    });
  });
});
