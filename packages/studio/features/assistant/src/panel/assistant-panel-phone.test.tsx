// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  chatOf,
  fakeHost,
  installFakePopover,
  openDialogsInJsdom,
  sendMessage,
  show,
  unmount,
} from "../test-support.tsx";
import { AssistantPanel } from "./assistant-panel.tsx";

let restorePopover = () => {};
beforeEach(() => {
  restorePopover = installFakePopover();
  openDialogsInJsdom();
});
afterEach(() => {
  unmount();
  restorePopover();
});

const routine = chatOf("c1", [{ role: "user", content: "Add a routine" }], "Add a routine");
const alias = {
  ...chatOf("c2", [{ role: "user", content: "Fix the alias" }], "Fix the triage alias"),
  itemsToReview: 2,
};
const triage = {
  ...chatOf("c3", [{ role: "user", content: "Hi" }], "Hi Triage"),
  kind: "agent:support/triage" as const,
};
const home = { get: () => "Home", subscribe: () => () => {} };

function phonePanel(fake: ReturnType<typeof fakeHost>) {
  const services = { get: () => fake.host, find: () => fake.host };
  const context = {
    services,
    announcer: { announce: () => {} },
    shownTitle: home,
  } as unknown as WorkspaceContext;
  return (
    <PresentationProvider presentation="phone">
      <AssistantPanel context={context} title="Assistant" onClose={() => {}} />
    </PresentationProvider>
  );
}

const topBar = (page: HTMLElement) => page.querySelector("header") as HTMLElement;
const statusLine = (page: HTMLElement) => topBar(page).querySelector("p")?.textContent;
/** The Recent chats sheet's rows, by their buttons. */
const recentRows = (page: HTMLElement) => [
  ...page.querySelectorAll<HTMLElement>("[data-row-id] > button"),
];
const moreEntries = (page: HTMLElement) =>
  [...topBar(page).querySelectorAll("[role^=menuitem]")].map((item) => item.textContent);

async function pickFromMore(page: HTMLElement, label: string) {
  const item = [...topBar(page).querySelectorAll<HTMLElement>("[role^=menuitem]")].find(
    (each) => each.textContent === label,
  );
  await act(async () => item?.click());
}

verifies("assistant.chat.phone-screen", () => {
  it("shows Assistant and the status line in the top bar, with the focus on Assistant", async () => {
    const page = await show(phonePanel(fakeHost([routine])));
    expect(topBar(page).textContent).toContain("Assistant");
    expect(topBar(page).textContent).not.toContain("Add a routine");
    expect(statusLine(page)).toBe("Looking at: Home");
    // Back and ⋮ only: no New chat and no ✕ outside the ⋮ menu.
    const buttons = [...topBar(page).querySelectorAll("button")].filter(
      (button) => button.closest("[role=menu]") === null,
    );
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Back",
      "More actions for Add a routine",
    ]);
    expect(document.activeElement?.textContent).toBe("Assistant");
  });

  it("says Running with its dot while it answers", async () => {
    const fake = fakeHost([routine]);
    const page = await show(phonePanel(fake));
    await sendMessage(page, "Add a step");
    expect(statusLine(page)).toBe("Running · thinking");
    expect(topBar(page).querySelector("p .bg-running")).not.toBeNull();
    await fake.finish({ messages: [], end: { reason: "answered" } });
  });

  it("says Stopped · model call limit after the last answer reached the limit", async () => {
    const fake = fakeHost([routine]);
    const page = await show(phonePanel(fake));
    await sendMessage(page, "Add a step");
    await fake.finish({ messages: [], end: { reason: "turn-limit", turns: 16 } });
    expect(statusLine(page)).toBe("Stopped · model call limit");
    expect(topBar(page).querySelector("p .bg-running")).toBeNull();
  });

  it("offers New chat, Recent chats, Rename and Delete chat in ⋮ for a kept chat", async () => {
    const page = await show(phonePanel(fakeHost([routine])));
    expect(moreEntries(page)).toEqual(["New chat", "Recent chats", "Rename", "Delete chat"]);
    // Delete chat is a danger item, last, below a divider (component specs 14).
    const remove = [...topBar(page).querySelectorAll("[role^=menuitem]")].at(-1);
    expect(remove?.className).toContain("text-danger");
    expect(remove?.previousElementSibling?.tagName).toBe("HR");
  });

  it("offers only Recent chats in ⋮ for a chat with no messages yet", async () => {
    const page = await show(phonePanel(fakeHost()));
    expect(moreEntries(page)).toEqual(["Recent chats"]);
  });

  it("lists the kept Build chats in Recent chats, with the phone's footer", async () => {
    const page = await show(phonePanel(fakeHost([routine, alias, triage])));
    await pickFromMore(page, "Recent chats");
    const names = recentRows(page).map((row) => row.textContent);
    expect(names).toHaveLength(2);
    expect(names[0]).toMatch(/^Add a routine, \S+$/);
    expect(names[1]).toMatch(/^Fix the triage alias, 2 to review, \S+$/);
    expect(page.textContent).toContain("Keeps your 40 most recent chats on your computer.");
    expect([...page.querySelectorAll("aside")].at(-1)?.querySelector("h2")?.textContent).toBe(
      "Recent chats",
    );
    expect(document.activeElement?.textContent).toBe("Recent chats");
  });

  it("shows a picked chat in place of the one before, with the focus on Assistant", async () => {
    const page = await show(phonePanel(fakeHost([routine, alias])));
    await pickFromMore(page, "Recent chats");
    const row = recentRows(page).find((each) =>
      each.textContent?.startsWith("Fix the triage alias"),
    );
    await act(async () => row?.click());
    expect(page.querySelector("[data-row-id]")).toBeNull();
    expect(page.querySelector("[data-chat-message]")?.textContent).toContain("Fix the alias");
    expect(document.activeElement?.textContent).toBe("Assistant");
  });

  it("goes back to the chat from Recent chats with Back", async () => {
    const page = await show(phonePanel(fakeHost([routine, alias])));
    await pickFromMore(page, "Recent chats");
    const backs = [...page.querySelectorAll<HTMLButtonElement>('button[aria-label="Back"]')];
    await act(async () => backs.at(-1)?.click());
    expect(page.textContent).not.toContain("Keeps your 40 most recent chats");
    expect(page.querySelector("[data-chat-message]")?.textContent).toContain("Add a routine");
  });

  it("renames the chat in the Rename chat sheet", async () => {
    const fake = fakeHost([routine]);
    const page = await show(phonePanel(fake));
    await pickFromMore(page, "Rename");
    const sheet = document.querySelector("dialog[open]") as HTMLDialogElement;
    expect(sheet.querySelector("h2")?.textContent).toBe("Rename chat");
    const field = sheet.querySelector("input") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        field,
        "Daily triage",
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const rename = [...sheet.querySelectorAll("button")].find((button) =>
      button.textContent?.trim().startsWith("Rename"),
    );
    await act(async () => rename?.click());
    expect(fake.kept()[0]?.title).toBe("Daily triage");
  });

  it("centres an empty chat's heading in text-heading, with no customize skill link", async () => {
    const page = await show(phonePanel(fakeHost()));
    const heading = page.querySelector("h3");
    expect(heading?.textContent).toBe("What should we build?");
    expect(heading?.className).toContain("text-heading");
    expect(heading?.parentElement?.className).toContain("justify-center");
    expect(page.textContent).not.toContain("customize skill");
  });
});

verifies("assistant.chat.recent-chats-dot", () => {
  it("marks a chat with items to review with the violet dot, not a label", async () => {
    const page = await show(phonePanel(fakeHost([routine, alias])));
    await pickFromMore(page, "Recent chats");
    const [plain, toReview] = recentRows(page);
    expect(plain?.querySelector("[data-flag]")).toBeNull();
    const dot = toReview?.querySelector("[data-flag]");
    expect(dot?.className).toContain("bg-warning");
    expect(dot?.textContent).toBe(", 2 to review");
    expect(toReview?.querySelector(".bg-running")).toBeNull();
  });

  it("shows the running dot, and no violet dot, while a chat answers", async () => {
    const page = await show(phonePanel(fakeHost([{ ...alias, answering: true }])));
    await pickFromMore(page, "Recent chats");
    const [answering] = recentRows(page);
    expect(answering?.querySelector(".bg-running")).not.toBeNull();
    expect(answering?.querySelector("[data-flag]")).toBeNull();
    expect(answering?.textContent).toMatch(/^Fix the triage alias, answering, \S+$/);
  });
});
