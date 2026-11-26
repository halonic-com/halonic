// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { openChat, openMessenger } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** Acme's Chief, with one message the board hasn't seen. */
function acme() {
  const messaging = new FakeAgentMessaging();
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id);
  messaging.addMessage(chat.id, { body: "Shall I merge #12?" });
  return messaging;
}

/** Chief's row's name and line, as the kit's plain row draws them. */
function chiefRow(page: HTMLElement) {
  const button = page.querySelector("nav li button") as HTMLElement;
  const name = button.querySelector("bdi")?.parentElement as HTMLElement;
  const line = [...button.querySelectorAll("span")].findLast(
    (span) => span.textContent === "Shall I merge #12?",
  ) as HTMLElement;
  return { name: name.className.split(" "), line: line.className.split(" ") };
}

verifies("messenger.shared-layout", () => {
  it("draws an unread chat's row with a semibold name and a full-colour line", async () => {
    const page = await openMessenger(acme());
    const row = chiefRow(page);

    expect(row.name).toContain("font-semibold");
    expect(row.line).toContain("text-fg");
  });

  it("draws the open chat's header picture at 40px, and its row as read", async () => {
    const page = await openMessenger(acme());
    await openChat(page, "Chief");
    const header = page.querySelector("main header") as HTMLElement;
    const row = chiefRow(page);

    expect(header.firstElementChild?.className.split(" ")).toContain("size-10");
    expect(header.querySelector("h2")?.textContent).toBe("Chief");
    expect(row.name).toContain("text-body");
    expect(row.name).not.toContain("font-semibold");
    expect(row.line).toContain("text-fg-muted");
  });
});
