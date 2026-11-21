import { describe, expect, it } from "vitest";
import { RECONNECT_TO_ANSWER } from "../phone/remote-view.ts";
import {
  FakePhoneRemote,
  remoteApproval,
  remoteSession,
  remoteView,
  staleView,
} from "./fake-phone-remote.ts";

describe("FakePhoneRemote", () => {
  it("tells subscribers about each new view until they unsubscribe", () => {
    const remote = new FakePhoneRemote();
    const seen: number[] = [];
    const unsubscribe = remote.subscribe(() => seen.push(remote.view().sessions.length));

    remote.show(remoteView({ sessions: [remoteSession()] }));
    unsubscribe();
    remote.show(remoteView());

    expect(seen).toEqual([1]);
    expect(remote.view().sessions).toEqual([]);
  });

  it("keeps the same snapshot until something changes", () => {
    const remote = new FakePhoneRemote();
    expect(remote.view()).toBe(remote.view());
  });

  it("records an answer to an open approval and gives the host's outcome", async () => {
    const remote = new FakePhoneRemote(remoteView({ openApprovals: [remoteApproval()] }));
    remote.answerWith({ kind: "refused", code: "not-allowed-remotely" });

    const outcome = await remote.answer("session-1", "approval-1", "deny");

    expect(outcome).toEqual({ kind: "refused", code: "not-allowed-remotely" });
    expect(remote.answers).toEqual([
      { sessionId: "session-1", approvalId: "approval-1", decision: "deny" },
    ]);
  });

  it("sends no answer to an approval that is off", async () => {
    const risky = remoteApproval({ canAnswer: false, offReason: "Answer on your computer." });
    const remote = new FakePhoneRemote(remoteView({ openApprovals: [risky] }));

    expect(await remote.answer("session-1", "approval-1", "approve")).toEqual({
      kind: "not-sent",
      reason: "off",
    });
    expect(remote.answers).toEqual([]);
  });

  it("sends no prompt while stale, nor an empty or too long one", async () => {
    const remote = new FakePhoneRemote();
    expect(await remote.prompt("session-1", "")).toEqual({ kind: "not-sent", reason: "invalid" });
    expect(await remote.prompt("session-1", "x".repeat(10_001))).toEqual({
      kind: "not-sent",
      reason: "invalid",
    });

    remote.show(staleView(remote.view(), "reconnecting"));
    expect(await remote.prompt("session-1", "Keep going")).toEqual({
      kind: "not-sent",
      reason: "off",
    });
    expect(remote.prompts).toEqual([]);
  });
});

describe("staleView", () => {
  it("keeps what the view held and turns answering off", () => {
    const live = remoteView({ sessions: [remoteSession()], openApprovals: [remoteApproval()] });

    const stale = staleView(live, "unreachable");

    expect(stale.label.text).toBe("Can't reach your computer");
    expect(stale.asOf).toBe(live.asOf);
    expect(stale.sessions).toBe(live.sessions);
    expect(stale.canAnswer).toBe(false);
    expect(stale.offReason).toBe(RECONNECT_TO_ANSWER);
    expect(stale.openApprovals.map((open) => [open.canAnswer, open.offReason])).toEqual([
      [false, RECONNECT_TO_ANSWER],
    ]);
  });
});
