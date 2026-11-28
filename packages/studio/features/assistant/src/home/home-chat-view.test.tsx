// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  chatOf,
  fakeHost,
  hostContextOf,
  installFakePopover,
  show,
  triageQuestion,
  unmount,
} from "../test-support.tsx";
import { aiChats } from "./ai-chats.tsx";

let restorePopover = () => {};

beforeEach(() => {
  restorePopover = installFakePopover();
});

afterEach(() => {
  unmount();
  restorePopover();
  document.documentElement.removeAttribute("data-theme");
});

async function triagePane() {
  const fake = fakeHost([chatOf("triage", triageQuestion, "Triage")]);
  const context = hostContextOf(fake, vi.fn);
  aiChats.open("triage", context);
  return show(aiChats.render("triage", context, () => {}));
}

verifies("assistant.home.chat-look", () => {
  it("draws the chat header, the person's bubble and the message box, in light and dark", async () => {
    for (const theme of ["light", "dark"]) {
      document.documentElement.setAttribute("data-theme", theme);
      const pane = await triagePane();
      const header = pane.querySelector("header");
      expect(header?.className, theme).toContain("h-16");
      expect(header?.className, theme).toContain("shadow-header");
      expect(header?.querySelector("h2")?.textContent).toBe("Triage");
      expect(header?.querySelector("button[aria-label='More actions for Triage']")).not.toBeNull();
      const bubble = pane.querySelector("[data-chat-message='you']");
      expect(bubble?.textContent).toContain("Make a triage agent");
      const tile = header?.firstElementChild;
      expect(tile?.className).toContain("size-10");
      expect(tile?.className).toContain("bg-halo-tint");
      expect(tile?.querySelector("svg")).not.toBeNull();
      expect(pane.querySelector("textarea")?.closest(".rounded-composer")).not.toBeNull();
      unmount();
    }
  });

  it("replaces the whole header with the rename field while renaming, at the header's height", async () => {
    const pane = await triagePane();
    const more = pane.querySelector<HTMLElement>("button[aria-label='More actions for Triage']");
    await act(async () => more?.click());
    const rename = [...document.querySelectorAll<HTMLElement>("[role^=menuitem]")].find(
      (each) => each.textContent?.includes("Rename") === true,
    );
    await act(async () => rename?.click());
    expect(pane.querySelector("h2")).toBeNull();
    expect(pane.querySelector("button[aria-label='More actions for Triage']")).toBeNull();
    expect(pane.querySelector(".h-16 input")).not.toBeNull();
  });

  it("shows a new chat with the mark and its title, and no ⋮ until its first message", async () => {
    const fake = fakeHost([chatOf("draft")]);
    const context = hostContextOf(fake, vi.fn);
    aiChats.open("draft", context);
    const pane = await show(aiChats.render("draft", context, () => {}));
    const header = pane.querySelector("header");
    expect(header?.querySelector("h2")?.textContent).toBe("New chat");
    expect(header?.firstElementChild?.querySelector("svg")).not.toBeNull();
    expect(header?.querySelector("button[aria-label^='More actions']")).toBeNull();
  });
});
