// @vitest-environment jsdom
import type { SavedChatDocs } from "@halonicjs/ports";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AssistantPanel } from "../panel/assistant-panel.tsx";
import { buttonNamed, chatOf, fakeHost, show, unmount } from "../test-support.tsx";

afterEach(unmount);

const page = "https://docs.example.com/api";

/** A Build chat whose model called `read_docs` once, as `d1`, and was told to wait. */
const reading = chatOf(
  "c1",
  [
    { role: "user", content: "Read the API docs" },
    {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "d1", name: "read_docs", arguments: { url: page } }],
    },
    {
      role: "tool",
      toolCallId: "d1",
      name: "read_docs",
      content: "Waiting for the person to allow reading pages from docs.example.com.",
    },
  ],
  "Read the API docs",
);

const asked = { callId: "d1", at: "2026-11-25T10:00:00.000Z", url: page } as const;
const waiting: SavedChatDocs = {
  sites: [{ host: "docs.example.com", answer: "asked", cardId: "d1" }],
  log: [{ ...asked, outcome: "waiting", bytes: 0 }],
};

/** The panel on `reading`, with its site waiting for an answer. */
async function panel() {
  const fake = fakeHost([reading]);
  await fake.setDocs("c1", waiting);
  const services = { get: () => fake.host, find: () => fake.host };
  const context = { services, announcer: { announce: vi.fn() } } as unknown as WorkspaceContext;
  const shown = await show(
    <AssistantPanel context={context} title="Assistant" onClose={() => {}} />,
  );
  return { fake, page: shown };
}

const card = (shown: HTMLElement) => shown.querySelector("article");

verifies("assistant.build.site-card", () => {
  it("shows the call's log line and a card for the exact host, with Allow and Don't allow", async () => {
    const { page: shown } = await panel();
    expect(shown.textContent).toContain(`Waiting for your answer: ${page}`);
    const site = card(shown);
    expect(site?.getAttribute("aria-labelledby")).not.toBeNull();
    expect(site?.textContent).toContain("Read docs from docs.example.com?");
    expect(site?.textContent).toContain(
      "If you allow it, the assistant can read pages from this site for the rest of this chat.",
    );
    expect(buttonNamed(shown, "Allow")).toBeDefined();
    expect(buttonNamed(shown, "Don't allow")).toBeDefined();
  });

  it("records allowed on Allow, and shows the answer in place of the buttons", async () => {
    const { fake, page: shown } = await panel();
    await act(async () => buttonNamed(shown, "Allow")?.click());
    expect(fake.docsOf("c1")?.sites).toEqual([
      { host: "docs.example.com", answer: "allowed", cardId: "d1" },
    ]);
    expect(card(shown)?.textContent).toContain("Allowed for this chat.");
    expect(buttonNamed(shown, "Allow")).toBeUndefined();
    expect(document.activeElement?.textContent).toBe("Allowed for this chat.");
    expect(shown.textContent).not.toContain("Waiting for your answer");
  });

  it("records declined on Don't allow", async () => {
    const { fake, page: shown } = await panel();
    await act(async () => buttonNamed(shown, "Don't allow")?.click());
    expect(fake.docsOf("c1")?.sites[0]?.answer).toBe("declined");
    expect(card(shown)?.textContent).toContain("Not allowed in this chat.");
    expect(document.activeElement?.textContent).toBe("Not allowed in this chat.");
  });

  it("keeps the buttons and shows an error line with its icon when the answer can't be saved", async () => {
    const { fake, page: shown } = await panel();
    vi.spyOn(fake.host, "answerSite").mockRejectedValue(new Error("engine stopped"));
    await act(async () => buttonNamed(shown, "Allow")?.click());
    const alert = shown.querySelector('[role="alert"]');
    expect(alert?.querySelector("svg")).not.toBeNull();
    expect(buttonNamed(shown, "Allow")).toBeDefined();
  });

  it("shows a read page's line with its status and size", async () => {
    const { fake, page: shown } = await panel();
    const read = { ...asked, outcome: "read", status: 200, bytes: 12_288 } as const;
    await fake.setDocs("c1", { ...waiting, log: [read] });
    expect(shown.textContent).toContain(`Read ${page} (200), 12 KB`);
  });
});
