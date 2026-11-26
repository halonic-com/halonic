// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildChatsOf } from "../chat/build-chats.ts";
import { chatTime } from "../chat/chat-menu-words.ts";
import {
  buttonNamed,
  chatOf,
  fakeHost,
  installFakePopover,
  openDialogsInJsdom,
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

const today = new Date().toISOString();
const routine = {
  ...chatOf("c1", [{ role: "user", content: "Add a routine" }], "Add a routine"),
  lastUsedAt: today,
  answering: true,
};
const alias = {
  ...chatOf("c2", [{ role: "user", content: "Fix the alias" }], "Fix the triage alias"),
  itemsToReview: 2,
};

function panel(fake: ReturnType<typeof fakeHost>, announce: (text: string) => void = () => {}) {
  const services = { get: () => fake.host, find: () => fake.host };
  const context = { services, announcer: { announce } } as unknown as WorkspaceContext;
  return <AssistantPanel context={context} title="Assistant" onClose={() => {}} />;
}

// The chat menu is the panel's first menu; the Model and Chat with menus above the box come after.
const rows = (page: HTMLElement) =>
  [
    ...(page.querySelector("[role=menu]")?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ??
      []),
  ].map((row) => ({
    name: row.getAttribute("aria-label"),
    checked: row.getAttribute("aria-checked"),
  }));
const heading = (page: HTMLElement) => page.querySelector("h2")?.textContent;

async function pick(page: HTMLElement, label: string) {
  const item = [...page.querySelectorAll<HTMLElement>("[role^=menuitem]")].find(
    (each) => each.textContent?.includes(label) === true,
  );
  await act(async () => item?.click());
}

verifies("assistant.chat.menu", () => {
  it("lists the kept chats, recent first, with their time, running dot or to-review chip", async () => {
    const page = await show(panel(fakeHost([routine, alias])));
    const time = chatTime(today, new Date());
    expect(rows(page)).toEqual([
      { name: `Add a routine, ${time}, answering`, checked: "true" },
      {
        name: `Fix the triage alias, ${chatTime(alias.lastUsedAt, new Date())}, 2 to review`,
        checked: "false",
      },
    ]);
    expect(page.textContent).toContain("Keeps your 40 most recent chats on this computer.");
  });

  it("has only New chat and the footer when no chat is kept yet", async () => {
    const page = await show(panel(fakeHost()));
    expect(rows(page)).toEqual([]);
    expect(page.querySelector("[role=menu]")?.textContent).toBe(
      "New chatKeeps your 40 most recent chats on this computer.",
    );
  });

  it("keeps the title button's ▾ small, in a size-3.5 box, so the chat's name has the room", async () => {
    const page = await show(panel(fakeHost([routine])));
    const button = buttonNamed(page, "Add a routine");
    const chevron = button?.querySelector("svg");
    expect(chevron?.parentElement?.className).toContain("size-3.5");
    expect(chevron?.parentElement).not.toBe(button);
  });

  it("shows the chat picked, checked, with focus in the box", async () => {
    const page = await show(panel(fakeHost([routine, alias])));
    await pick(page, "Fix the triage alias");
    expect(heading(page)).toBe("Fix the triage alias");
    expect(rows(page).map((row) => row.checked)).toEqual(["false", "true"]);
    expect(document.activeElement?.tagName).toBe("TEXTAREA");
  });
});

describe("chatTime", () => {
  const now = new Date(2026, 10, 24, 12, 0);
  const at = (...parts: [number, number, number, number, number]) =>
    new Date(...parts).toISOString();
  it("says the time today, Yesterday, the day this week, then the date, as the kit does", () => {
    expect(chatTime(at(2026, 10, 24, 9, 5), now, "en-GB")).toBe("09:05");
    expect(chatTime(at(2026, 10, 23, 22, 0), now, "en-GB")).toBe("Yesterday");
    expect(chatTime(at(2026, 10, 20, 8, 0), now, "en-GB")).toBe("Fri");
    expect(chatTime(at(2026, 10, 3, 8, 0), now, "en-GB")).toBe("3 Nov");
    expect(chatTime(at(2025, 11, 2, 8, 0), now, "en-GB")).toBe("02/12/2025");
  });

  it("follows the format it's given", () => {
    expect(chatTime(at(2026, 10, 24, 9, 5), now, "en-US")).toMatch(/^9:05\sAM$/u);
    expect(chatTime(at(2026, 10, 3, 8, 0), now, "en-US")).toBe("Nov 3");
  });
});

async function rename(page: HTMLElement) {
  await pick(page, "Rename");
  return page.querySelector("header input") as HTMLInputElement;
}

function type(field: HTMLInputElement, text: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, text);
}

verifies("assistant.chat.rename", () => {
  it("turns the title into a field, and Enter saves it trimmed", async () => {
    const fake = fakeHost([alias]);
    const page = await show(panel(fake));
    const field = await rename(page);
    expect(field.getAttribute("aria-label")).toBe("Rename Fix the triage alias");
    type(field, "  Daily triage  ");
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(fake.kept()[0]?.title).toBe("Daily triage");
    expect(heading(page)).toBe("Daily triage");
  });

  it("puts the old title back when the field is left empty", async () => {
    const fake = fakeHost([alias]);
    const page = await show(panel(fake));
    const field = await rename(page);
    type(field, "   ");
    await act(async () => field.blur());
    expect(fake.kept()[0]?.title).toBe("Fix the triage alias");
    expect(heading(page)).toBe("Fix the triage alias");
  });

  it("cancels on Escape without saving", async () => {
    const fake = fakeHost([alias]);
    const page = await show(panel(fake));
    const field = await rename(page);
    type(field, "Other");
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(fake.kept()[0]?.title).toBe("Fix the triage alias");
    expect(page.querySelector("header input")).toBeNull();
  });
});

verifies("assistant.chat.delete", () => {
  it("offers Delete chat… in ⋮ as a danger item, last, below a divider", async () => {
    const page = await show(panel(fakeHost([routine])));
    const remove = [...page.querySelectorAll("[role^=menuitem]")].find(
      (item) => item.textContent === "Delete chat…",
    );
    expect(remove?.nextElementSibling).toBeNull();
    expect(remove?.className).toContain("text-danger");
    expect(remove?.previousElementSibling?.tagName).toBe("HR");
  });

  it("asks first, saying the changes to review stay, then shows no chat", async () => {
    const fake = fakeHost([alias]);
    const announce = vi.fn();
    const page = await show(panel(fake, announce));
    await pick(page, "Delete chat…");
    const dialog = document.querySelector("dialog") as HTMLElement;
    expect(dialog.textContent).toContain('Delete the chat "Fix the triage alias"?');
    expect(dialog.textContent).toContain("The changes it made in 2 items stay there to review.");
    // The button holds its busy label too, to keep its width.
    const confirm = [...dialog.querySelectorAll("button")].find((button) =>
      button.textContent?.startsWith("Delete chat"),
    );
    await act(async () => confirm?.click());
    expect(fake.kept()).toEqual([]);
    expect(page.textContent).toContain("No chat open");
    expect(document.activeElement?.textContent).toBe("New chat");
    // New chat taking focus doesn't say the chat is gone, so that is said out loud.
    expect(announce).toHaveBeenCalledWith("Deleted “Fix the triage alias”.", "polite");
  });

  it("changes nothing on Cancel, and a draft has no ⋮", async () => {
    const fake = fakeHost([routine]);
    const page = await show(panel(fake));
    await pick(page, "Delete chat…");
    const dialog = document.querySelector("dialog") as HTMLElement;
    expect(dialog.textContent).not.toContain("stay there to review");
    await act(async () => buttonNamed(dialog, "Cancel")?.click());
    expect(fake.kept()).toHaveLength(1);
    expect(heading(page)).toBe("Add a routine");

    const draft = await show(panel(fakeHost()));
    expect(buttonNamed(draft, "More actions for New chat")).toBeUndefined();
  });

  it("says nothing more about an answer whose chat was deleted while it answered", async () => {
    const fake = fakeHost([alias]);
    const chats = buildChatsOf(fake.host);
    await chats.open();
    const announce = vi.fn();
    const answer = chats.send("c2", "Carry on", announce);
    await chats.deleteChat("c2");
    await fake.finish(new Error("The chat is gone"));
    await answer;
    expect(announce).not.toHaveBeenCalled();
  });
});
