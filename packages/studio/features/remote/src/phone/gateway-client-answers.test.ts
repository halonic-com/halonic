import type { GatewayApproval } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayScene } from "../test-support/gateway-scene.ts";
import { listedSession } from "../test-support/listed-session.ts";
import { RECONNECT_TO_ANSWER } from "./remote-view.ts";
import { ANSWER_RISKY_ON_COMPUTER } from "./view-of.ts";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-21T15:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const normal: GatewayApproval = { id: "a-1", summary: "Send 4 replies", risk: "normal" };

/** A live view of one waiting session whose event 1 requests `approval`. */
function waitingOn(approval: GatewayApproval = normal): GatewayScene {
  const scene = new GatewayScene();
  scene.connectAndList([listedSession({ state: "waiting", lastSeq: 1 })]);
  scene.event("session-1", 1, { type: "approval-requested", approval });
  return scene;
}

verifies("remote.phone-remote-answers", () => {
  describe("live or stale", () => {
    it("is live once connected and listed, with asOf from the phone's own clock", () => {
      const scene = new GatewayScene();
      scene.connect();
      expect(scene.client.view().canAnswer).toBe(false);
      scene.list([listedSession({ updatedAt: "2030-01-01T00:00:00.000Z" })]);
      const view = scene.client.view();
      expect(view.canAnswer).toBe(true);
      expect(view.offReason).toBeUndefined();
      expect(view.asOf).toEqual(new Date("2026-11-21T15:00:00.000Z"));
      expect(view.label.text).toBe("Connected · Work laptop");
    });

    it("goes stale on a drop, keeping the last sessions and approvals", () => {
      const scene = waitingOn();
      scene.drop();
      const view = scene.client.view();
      expect(view.canAnswer).toBe(false);
      expect(view.offReason).toBe(RECONNECT_TO_ANSWER);
      expect(view.sessions).toHaveLength(1);
      expect(view.openApprovals[0]).toMatchObject({
        canAnswer: false,
        offReason: RECONNECT_TO_ANSWER,
      });
    });

    it("tells its subscribers of every new snapshot, and keeps it until then", () => {
      const scene = new GatewayScene();
      const onChange = vi.fn();
      scene.client.subscribe(onChange);
      const before = scene.client.view();
      expect(scene.client.view()).toBe(before);
      scene.connectAndList([]);
      expect(onChange).toHaveBeenCalled();
      expect(scene.client.view()).not.toBe(before);
    });
  });

  describe("answers", () => {
    it("shows an approval until it settles, and sends an answer once", async () => {
      const scene = waitingOn();
      expect(scene.client.view().openApprovals[0]).toMatchObject({ canAnswer: true });
      const outcome = scene.client.answer("session-1", "a-1", "approve");
      expect(scene.client.view().openApprovals[0]).toMatchObject({
        canAnswer: false,
        sent: "approve",
      });
      expect(await scene.client.answer("session-1", "a-1", "deny")).toEqual({
        kind: "not-sent",
        reason: "off",
      });
      scene.ok(scene.tunnel.lastOf("answer-approval").id);
      expect(await outcome).toEqual({ kind: "done" });
      scene.event("session-1", 2, {
        type: "approval-settled",
        approvalId: "a-1",
        decision: "approve",
      });
      expect(scene.client.view().openApprovals).toEqual([]);
      expect(scene.tunnel.sentOf("answer-approval")).toHaveLength(1);
    });

    it("passes on the host's refusal, and lets the person answer again", async () => {
      const scene = waitingOn();
      const outcome = scene.client.answer("session-1", "a-1", "deny");
      const { id } = scene.tunnel.lastOf("answer-approval");
      scene.host({ type: "error", replyTo: id, code: "not-allowed-remotely" });
      expect(await outcome).toEqual({ kind: "refused", code: "not-allowed-remotely" });
      expect(scene.client.view().openApprovals[0]).toMatchObject({ canAnswer: true });
    });

    it("never answers a risky approval", async () => {
      const scene = waitingOn({ ...normal, risk: "risky" });
      expect(scene.client.view().openApprovals[0]).toMatchObject({
        canAnswer: false,
        offReason: ANSWER_RISKY_ON_COMPUTER,
      });
      expect(await scene.client.answer("session-1", "a-1", "approve")).toEqual({
        kind: "not-sent",
        reason: "off",
      });
      expect(scene.tunnel.sentOf("answer-approval")).toEqual([]);
    });

    it("settles an answer cut off by a drop by what the reconnect shows", async () => {
      const scene = waitingOn();
      const landed = scene.client.answer("session-1", "a-1", "approve");
      scene.drop();
      expect(await landed).toEqual({ kind: "cut-off" });

      scene.connectAndList([listedSession({ state: "running", lastSeq: 2 })]);
      expect(scene.client.view().openApprovals[0]).toMatchObject({ sent: "approve" });
      scene.event("session-1", 2, {
        type: "approval-settled",
        approvalId: "a-1",
        decision: "approve",
      });
      expect(scene.client.view().openApprovals).toEqual([]);
      expect(scene.tunnel.sentOf("answer-approval")).toHaveLength(1);
    });

    it("lets the person answer again when the reconnect shows the answer never landed", async () => {
      const scene = waitingOn();
      const lost = scene.client.answer("session-1", "a-1", "approve");
      scene.drop();
      await lost;
      scene.connectAndList([listedSession({ state: "waiting", lastSeq: 1 })]);
      expect(scene.client.view().openApprovals[0]).toMatchObject({
        canAnswer: true,
        sent: undefined,
      });
      expect(scene.tunnel.sentOf("answer-approval")).toHaveLength(1);
    });

    it("says what the shell refused, and sent nothing", async () => {
      const scene = waitingOn();
      scene.tunnel.refuseWith = "not-open";
      expect(await scene.client.answer("session-1", "a-1", "approve")).toEqual({
        kind: "not-sent",
        reason: "not-open",
      });
      expect(scene.client.view().openApprovals[0]).toMatchObject({ canAnswer: true });
    });
  });

  describe("prompts", () => {
    it("sends a prompt to the session and settles it with the host's ok", async () => {
      const scene = waitingOn();
      const outcome = scene.client.prompt("session-1", "Use the short version");
      const prompt = scene.tunnel.lastOf("prompt");
      expect(prompt).toMatchObject({ sessionId: "session-1", text: "Use the short version" });
      scene.ok(prompt.id);
      expect(await outcome).toEqual({ kind: "done" });
    });

    it("sends no empty, too long or stale prompt", async () => {
      const scene = waitingOn();
      const invalid = { kind: "not-sent", reason: "invalid" };
      expect(await scene.client.prompt("session-1", "  ")).toEqual(invalid);
      expect(await scene.client.prompt("session-1", "x".repeat(10_001))).toEqual(invalid);
      scene.drop();
      expect(await scene.client.prompt("session-1", "hi")).toEqual({
        kind: "not-sent",
        reason: "off",
      });
      expect(scene.tunnel.sentOf("prompt")).toEqual([]);
    });
  });
});
