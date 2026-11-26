import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeShell } from "./fake-shell.test-helper.ts";
import { shellChatOpens } from "./shell-chat-opens.ts";

const fail = (error: unknown) => {
  throw error;
};

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

verifies("messenger.open-from-quick-ask", () => {
  describe("shellChatOpens", () => {
    it("takes the chat that opened Messenger's window from the shell once", async () => {
      const waiting: unknown[] = [{ conversation: "chat-acme-chief" }, null];
      const shell = new FakeShell().answer("plugin:quick-ask|take_chat", () => waiting.shift());
      const opens = shellChatOpens(shell, fail);
      expect(await opens.takePending()).toBe("chat-acme-chief");
      expect(await opens.takePending()).toBe("chat-acme-chief");
      expect(shell.callsOf("plugin:quick-ask|take_chat")).toHaveLength(1);
      expect(await shellChatOpens(shell, fail).takePending()).toBeUndefined();
    });

    it("reports a refused take and opens nothing", async () => {
      const refused = new Error("not_messenger");
      const heard: unknown[] = [];
      const shell = new FakeShell().answer("plugin:quick-ask|take_chat", () => {
        throw refused;
      });
      const opens = shellChatOpens(shell, (error) => heard.push(error));
      expect(await opens.takePending()).toBeUndefined();
      expect(heard).toEqual([refused]);
    });

    it("hears the chats handed to Messenger's window, until it stops", async () => {
      const shell = listeningShell();
      const heard: string[] = [];
      const stop = shellChatOpens(shell, fail).subscribe((conversation) =>
        heard.push(conversation),
      );
      const listen = listenOf(shell);
      expect(listen["event"]).toBe("open-conversation");
      expect(listen["target"]).toEqual({ kind: "Window", label: "messenger" });
      const channel = `__CHANNEL__:${Number(listen["handler"])}`;
      const send = (payload: unknown) =>
        shell.send(channel, { event: "open-conversation", id: 7, payload });
      send({ conversation: "chat-acme-chief" });
      send({ conversation: "" });
      send({ conversation: 7 });
      send("chat-acme-liam");
      shell.send(channel, null);
      expect(heard).toEqual(["chat-acme-chief"]);
      stop();
      await Promise.resolve();
      await Promise.resolve();
      expect(shell.registered(channel)).toBe(false);
      expect(shell.callsOf("plugin:event|unlisten")).toEqual([
        { event: "open-conversation", eventId: 7 },
      ]);
    });

    it("reports a refused listen, and stopping then calls nothing more", async () => {
      const refused = new Error("not allowed");
      const heard: unknown[] = [];
      const shell = new FakeShell().answer("plugin:event|listen", () => {
        throw refused;
      });
      const stop = shellChatOpens(shell, (error) => heard.push(error)).subscribe(fail);
      await Promise.resolve();
      await Promise.resolve();
      stop();
      await Promise.resolve();
      expect(heard).toEqual([refused]);
      expect(shell.callsOf("plugin:event|unlisten")).toEqual([]);
    });
  });
});
