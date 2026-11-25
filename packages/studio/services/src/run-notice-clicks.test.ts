import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { NoticeTarget } from "./agent-notifications.ts";
import { FakeShell } from "./fake-shell.test-helper.ts";
import { shellRunNoticeClicks } from "./run-notice-clicks.ts";

const fail = (error: unknown) => {
  throw error;
};

/** A shell that lets the page listen and stop listening to events. */
function listeningShell(): FakeShell {
  return new FakeShell()
    .answer("plugin:event|listen", () => 7)
    .answer("plugin:event|unlisten", () => null);
}

function handlerOf(shell: FakeShell): number {
  const call = shell.callsOf("plugin:event|listen")[0];
  if (call === undefined) throw new Error("nobody listens");
  return Number(call["handler"]);
}

verifies("runs.run-notification-open", () => {
  describe("shellRunNoticeClicks", () => {
    it("takes the click that opened the window from the shell once, and answers the same after", async () => {
      const waiting: unknown[] = [{ messagingId: "run-acme-7", kind: "run" }, null];
      const shell = new FakeShell().answer("take_pending_notification_click", () =>
        waiting.shift(),
      );
      const clicks = shellRunNoticeClicks(shell, fail);
      expect(await clicks.takePending()).toEqual({ kind: "run", id: "run-acme-7" });
      expect(await clicks.takePending()).toEqual({ kind: "run", id: "run-acme-7" });
      expect(shell.callsOf("take_pending_notification_click")).toHaveLength(1);
      expect(await shellRunNoticeClicks(shell, fail).takePending()).toBeUndefined();
    });

    it("reports a refused take and opens nothing", async () => {
      const refused = new Error("not allowed");
      const heard: unknown[] = [];
      const shell = new FakeShell().answer("take_pending_notification_click", () => {
        throw refused;
      });
      const clicks = shellRunNoticeClicks(shell, (error) => heard.push(error));
      expect(await clicks.takePending()).toBeUndefined();
      expect(heard).toEqual([refused]);
    });

    it("hears only clicks on runs and the Failed group, until it stops", async () => {
      const shell = listeningShell();
      const heard: NoticeTarget[] = [];
      const stop = shellRunNoticeClicks(shell, fail).subscribe((target) => heard.push(target));
      const channel = `__CHANNEL__:${handlerOf(shell)}`;
      const send = (payload: unknown) =>
        shell.send(channel, { event: "notification-clicked", id: 7, payload });
      send({ messagingId: "run-acme-7", kind: "run" });
      send({ messagingId: "failed", kind: "runs-failed" });
      send({ messagingId: "chat-acme-2", kind: "conversation" });
      send({ messagingId: "", kind: "run" });
      send({ messagingId: "run-acme-8" });
      expect(heard).toEqual([
        { kind: "run", id: "run-acme-7" },
        { kind: "runs-failed", id: "failed" },
      ]);
      stop();
      await Promise.resolve();
      await Promise.resolve();
      expect(shell.registered(channel)).toBe(false);
      expect(shell.callsOf("plugin:event|unlisten")).toEqual([
        { event: "notification-clicked", eventId: 7 },
      ]);
    });

    it("reports a refused listen, and stopping then calls nothing more", async () => {
      const refused = new Error("not allowed");
      const heard: unknown[] = [];
      const shell = new FakeShell().answer("plugin:event|listen", () => {
        throw refused;
      });
      const stop = shellRunNoticeClicks(shell, (error) => heard.push(error)).subscribe(fail);
      await Promise.resolve();
      await Promise.resolve();
      stop();
      await Promise.resolve();
      expect(heard).toEqual([refused]);
      expect(shell.callsOf("plugin:event|unlisten")).toEqual([]);
    });

    it("ignores a message that carries no click", () => {
      const shell = listeningShell();
      const heard: NoticeTarget[] = [];
      shellRunNoticeClicks(shell, fail).subscribe((target) => heard.push(target));
      const channel = `__CHANNEL__:${handlerOf(shell)}`;
      shell.send(channel, null);
      shell.send(channel, { event: "notification-clicked" });
      shell.send(channel, { event: "notification-clicked", payload: "not a click" });
      shell.send(channel, { event: "notification-clicked", payload: { kind: "run" } });
      shell.send(channel, {
        event: "notification-clicked",
        payload: { messagingId: 7, kind: "run" },
      });
      expect(heard).toEqual([]);
    });
  });
});
