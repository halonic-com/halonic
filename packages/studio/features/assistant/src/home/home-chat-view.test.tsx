// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chatOf, fakeHost, installFakePopover, show, unmount } from "../test-support.tsx";
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

const asked = [{ role: "user", content: "Make a triage agent" }] as const;

function contextOf(fake: ReturnType<typeof fakeHost>): WorkspaceContext {
  const services = { get: () => fake.host, find: () => fake.host };
  return {
    services,
    announcer: { announce: vi.fn() },
    openItem: vi.fn(),
    openItemInNewTab: vi.fn(),
  } as unknown as WorkspaceContext;
}

async function triagePane() {
  const fake = fakeHost([chatOf("triage", asked, "Triage")]);
  const context = contextOf(fake);
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
      expect(pane.querySelector("textarea")).not.toBeNull();
      unmount();
    }
  });

  it("puts the rename field where the heading was, at the header's height", async () => {
    const pane = await triagePane();
    const more = pane.querySelector<HTMLElement>("button[aria-label='More actions for Triage']");
    await act(async () => more?.click());
    const rename = [...document.querySelectorAll<HTMLElement>("[role^=menuitem]")].find(
      (each) => each.textContent?.includes("Rename") === true,
    );
    await act(async () => rename?.click());
    expect(pane.querySelector("h2")).toBeNull();
    expect(pane.querySelector(".h-16 input")).not.toBeNull();
  });
});
