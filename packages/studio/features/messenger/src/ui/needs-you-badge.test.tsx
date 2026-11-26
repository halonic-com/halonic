// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openMessenger, press } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

/** The picture decoder and canvas jsdom lacks: every PNG decodes. */
beforeEach(() => {
  vi.stubGlobal("createImageBitmap", (blob: Blob) =>
    blob.type === "image/png"
      ? Promise.resolve({ width: 2, height: 2, close: () => {} })
      : Promise.reject(new Error("not a picture")),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: () => {},
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Acme's Liam, with a picture, asks to approve "Merge #12?"; Chief asks "Which hostname?". */
function acme() {
  const messaging = new FakeAgentMessaging();
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const picture = { name: "liam.png", type: "image/png", bytes: new Uint8Array([137, 80]) };
  const liam = messaging.addAgent(source.id, { name: "Liam", picture });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  for (const agent of [liam, chief]) messaging.addConversation(agent.id);
  messaging.addInboxItem(source.id, {
    question: "Merge #12?",
    kind: "approval",
    createdAt: "2026-11-26T08:00:00.000Z",
    from: { kind: "agent", agent: liam.id, name: "Liam" },
    options: [{ id: "yes", label: "Yes" }],
  });
  messaging.addInboxItem(source.id, {
    question: "Which hostname?",
    createdAt: "2026-11-26T09:00:00.000Z",
    from: { kind: "agent", agent: chief.id, name: "Chief" },
    options: [{ id: "docs", label: "docs.acme.example" }],
  });
  return messaging;
}

verifies("messenger.needs-you-badge", () => {
  it("shows who asked as their picture and the card's kind as its badge, and no badge on chats", async () => {
    const page = await openMessenger(acme());
    const chats = [...page.querySelectorAll("nav li button")];
    expect(chats.some((chat) => chat.querySelector("[data-avatar-badge]") !== null)).toBe(false);
    await press(page.querySelector("nav [data-needs-you-entry]"));
    const [liam, chief] = [...page.querySelectorAll("main [data-needs-you-card]")].map((card) =>
      card.querySelector('[aria-hidden="true"]'),
    );
    expect(liam?.querySelector("canvas")).not.toBeNull();
    expect(liam?.querySelector("[data-avatar-badge] svg rect")).not.toBeNull();
    expect(chief?.textContent).toBe("C");
    expect(chief?.querySelector("[data-avatar-badge] svg")).not.toBeNull();
  });
});
