import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type ItemLayoutChoices, itemLayout } from "./item-layout.ts";

const chatOpen: ItemLayoutChoices = { chatOpen: true, panelClosed: false, panelScreen: false };

verifies("shell.item-page-chat", () => {
  it("gives the whole tab to the view when the kind has no chat", () => {
    expect(itemLayout({ hasChat: false, ...chatOpen }, 700, 1600)).toEqual({
      shows: "view",
      ask: false,
    });
    expect(itemLayout({ hasChat: false, ...chatOpen, panelScreen: true }, 700, 800)).toEqual({
      shows: "view",
      ask: false,
    });
  });

  it("offers to open a chat that starts closed", () => {
    expect(itemLayout({ hasChat: true, ...chatOpen, chatOpen: false }, 700, 1600)).toEqual({
      shows: "view",
      ask: true,
    });
  });

  it("puts the chat beside the panel at the panel's width", () => {
    expect(itemLayout({ hasChat: true, ...chatOpen }, 700, 1600)).toEqual({
      shows: "chat-and-panel",
      panelWidth: 700,
    });
    // Narrowed so the chat keeps 320px (shell.panel-width).
    expect(itemLayout({ hasChat: true, ...chatOpen }, 812, 1000)).toEqual({
      shows: "chat-and-panel",
      panelWidth: 592,
    });
  });

  it("draws the tab as wide before it was measured", () => {
    expect(itemLayout({ hasChat: true, ...chatOpen }, 700, undefined)).toEqual({
      shows: "chat-and-panel",
      panelWidth: 700,
    });
  });

  it("centres the chat with a button for the panel after its ✕", () => {
    expect(itemLayout({ hasChat: true, ...chatOpen, panelClosed: true }, 700, 1600)).toEqual({
      shows: "chat",
      panelControl: "reopen",
    });
  });

  it("turns the panel into a button in a tab with no room for it", () => {
    expect(itemLayout({ hasChat: true, ...chatOpen }, 700, 800)).toEqual({
      shows: "chat",
      panelControl: "narrow",
    });
    expect(itemLayout({ hasChat: true, ...chatOpen, panelClosed: true }, 700, 800)).toEqual({
      shows: "chat",
      panelControl: "narrow",
    });
  });

  it("shows the panel's own screen in a narrow tab, and beside the chat once the tab widens", () => {
    const choices = { hasChat: true, ...chatOpen, panelScreen: true };
    expect(itemLayout(choices, 700, 800)).toEqual({ shows: "panel-screen" });
    expect(itemLayout(choices, 700, 1200)).toEqual({ shows: "chat-and-panel", panelWidth: 700 });
  });
});
