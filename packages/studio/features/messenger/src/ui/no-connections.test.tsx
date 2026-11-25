// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Messenger } from "../messenger.ts";
import { byText, openMessenger, press, settle } from "../test-support/page.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import { MessengerPage } from "./messenger-page.tsx";

afterEach(unmountAll);

verifies("messenger.not-connected", () => {
  describe("MessengerPage with nothing connected", () => {
    it("says No connections and opens Settings › Connections from Connect Paperclip", async () => {
      const onConnect = vi.fn();
      const page = render(
        <MessengerPage messenger={new Messenger(new FakeAgentMessaging())} onConnect={onConnect} />,
      );
      await settle();
      expect(page.querySelector("main")?.textContent).toContain("No connections");
      await press(byText(page, "main button", "Connect Paperclip"));
      expect(onConnect).toHaveBeenCalledOnce();
    });

    it("has no button when the window can't open Settings", async () => {
      const page = await openMessenger(new FakeAgentMessaging());
      expect(page.querySelector("main")?.textContent).toContain("No connections");
      expect(page.querySelector("main button")).toBeNull();
    });

    it("says No connections in a narrow window too, without Back to chats", async () => {
      const page = await openMessenger(new FakeAgentMessaging(), [], true);
      expect(page.querySelector("main")?.textContent).toContain("No connections");
      expect(page.querySelector("main")?.textContent).not.toContain("Back to chats");
    });

    it("shows Pick a chat, not No connections, for a connected Paperclip with no chats", async () => {
      const messaging = new FakeAgentMessaging();
      messaging.addSource({ label: "Paperclip · Acme" });
      const page = await openMessenger(messaging);
      expect(page.querySelector("main")?.textContent).toBe("Pick a chat to read it.");
      expect(page.querySelector("nav")?.textContent).toContain("No chats yet.");
    });

    it("leaves the list out, without tabs or No chats yet., so No connections is the one message", async () => {
      const page = await openMessenger(new FakeAgentMessaging());
      expect(page.textContent).not.toContain("No chats yet.");
      expect(page.querySelector("[role=tablist]")).toBeNull();
      // No empty Messenger landmark either (HAL-18316 MS12).
      expect(page.querySelector("nav")).toBeNull();
    });
  });
});
