import { ServiceRegistry } from "@halonicjs/app";
import { ChatClicksService } from "@halonicjs/studio-feature-messenger/api";
import type { TauriCallbacks, TauriIpc } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { provideChatClicks } from "./provide-chat-clicks.ts";

/** A shell that answers `plugin:quick-ask|take_chat` with Chief's chat and records its calls. */
function chiefShell(calls: string[]): TauriIpc & TauriCallbacks {
  return {
    invoke: (command) => {
      calls.push(command);
      return Promise.resolve({ messagingId: "chat-acme-chief", kind: "conversation" });
    },
    transformCallback: () => 1,
    unregisterCallback: () => undefined,
  };
}

verifies("messenger.handed-chats", () => {
  describe("provideChatClicks", () => {
    it("gives Messenger's window the chat the shell kept for it", async () => {
      const services = new ServiceRegistry();
      const calls: string[] = [];
      provideChatClicks(services, chiefShell(calls), "messenger");
      expect(await services.get(ChatClicksService).takePending()).toBe("chat-acme-chief");
      expect(calls).toEqual(["plugin:quick-ask|take_chat"]);
    });

    it("gives no other window and no browser the shell's chats", () => {
      for (const label of ["main", "inbox", "ask", undefined]) {
        const services = new ServiceRegistry();
        provideChatClicks(services, chiefShell([]), label);
        expect(services.has(ChatClicksService)).toBe(false);
      }
      const services = new ServiceRegistry();
      provideChatClicks(services, undefined, "messenger");
      expect(services.has(ChatClicksService)).toBe(false);
    });
  });
});
