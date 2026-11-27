// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { openMessenger } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** Acme with 40 agents, each in its own chat: more rows than a 700px window holds. */
function manyChats() {
  const messaging = new FakeAgentMessaging();
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  for (let index = 1; index <= 40; index += 1) {
    const agent = messaging.addAgent(source.id, { name: `Agent ${index}` });
    const chat = messaging.addConversation(agent.id);
    messaging.addMessage(chat.id, { body: `Update ${index}` });
  }
  return messaging;
}

/** The classes of an element, as a list. */
function classesOf(element: Element | null | undefined): string[] {
  return element?.className.split(" ") ?? [];
}

verifies("messenger.chats-scroll", () => {
  // jsdom lays nothing out, so the test checks the classes that make the region scroll.
  it("scrolls the rows inside the sidebar, below the search and Needs you, which stay put", async () => {
    const page = await openMessenger(manyChats());
    const nav = page.querySelector("nav") as HTMLElement;
    const rows = nav.querySelector("ul");
    const scroller = rows?.closest("[data-chats-scroll]");

    expect(nav.querySelectorAll("li")).toHaveLength(40);
    expect(classesOf(scroller)).toEqual(
      expect.arrayContaining(["min-h-0", "flex-1", "overflow-y-auto"]),
    );
    expect(classesOf(nav)).toContain("flex-col");
    // The search and Needs you sit before the scrolling rows, outside them.
    expect(scroller?.parentElement).toBe(nav);
    const before = [...nav.children].slice(0, [...nav.children].indexOf(scroller as Element));
    expect(before.length).toBeGreaterThanOrEqual(2);
    expect(before.some((part) => part.textContent?.includes("Needs you"))).toBe(true);
  });
});
