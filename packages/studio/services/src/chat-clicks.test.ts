import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { shellChatClicks } from "./chat-clicks.ts";
import { FakeShell } from "./fake-shell.test-helper.ts";

const fail = (error: unknown) => {
  throw error;
};

const takeCommand = "plugin:quick-ask|take_chat";

/** A shell that lets the page listen and stop listening to events. */
function listeningShell(): FakeShell {
  return new FakeShell()
    .answer("plugin:event|listen", () => 7)
    .answer("plugin:event|unlisten", () => null);
}

function listenOf(shell: FakeShell): Record<string, unknown> {
  const call = shell.callsOf("plugin:event|listen")[0];
  if (call === undefined) throw new Error("nobody listens");
  return call;
}

verifies("services.chat-clicks", () => {
  describe("shellChatClicks", () => {
    it("takes the chat that opened Messenger's window once, and answers the same after", async () => {
      const kept: unknown[] = [{ messagingId: "chat-acme-chief", kind: "conversation" }, null];
      const shell = new FakeShell().answer(takeCommand, () => kept.shift());
      const clicks = shellChatClicks(shell, fail);
      expect(await clicks.takePending()).toBe("chat-acme-chief");
      expect(await clicks.takePending()).toBe("chat-acme-chief");
      expect(shell.callsOf(takeCommand)).toHaveLength(1);
      expect(await shellChatClicks(shell, fail).takePending()).toBeUndefined();
    });

    it("reports a refused take and opens nothing", async () => {
      const refused = new Error("not_messenger");
      const heard: unknown[] = [];
      const shell = new FakeShell().answer(takeCommand, () => {
        throw refused;
      });
      expect(await shellChatClicks(shell, (error) => heard.push(error)).takePending()).toBe(
        undefined,
      );
      expect(heard).toEqual([refused]);
    });

    it("hears only chats sent to Messenger's window, until it stops", async () => {
      const shell = listeningShell();
      const heard: string[] = [];
      const stop = shellChatClicks(shell, fail).subscribe((chat) => heard.push(chat));
      const listen = listenOf(shell);
      expect(listen["target"]).toEqual({ kind: "Window", label: "messenger" });
      const channel = `__CHANNEL__:${Number(listen["handler"])}`;
      const send = (payload: unknown) =>
        shell.send(channel, { event: "notification-clicked", id: 7, payload });
      send({ messagingId: "chat-acme-chief", kind: "conversation" });
      send({ messagingId: "run-acme-7", kind: "run" });
      send({ messagingId: "item-acme-3", kind: "inbox-item" });
      send({ messagingId: "", kind: "conversation" });
      send({ messagingId: "chat-acme-liam" });
      send("not a click");
      expect(heard).toEqual(["chat-acme-chief"]);
      stop();
      await Promise.resolve();
      await Promise.resolve();
      expect(shell.registered(channel)).toBe(false);
      expect(shell.callsOf("plugin:event|unlisten")).toEqual([
        { event: "notification-clicked", eventId: 7 },
      ]);
    });
  });
});
