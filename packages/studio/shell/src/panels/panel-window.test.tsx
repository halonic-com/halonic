// @vitest-environment jsdom

import { SidePanel } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useRef } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { DialogHostProps } from "../dialogs/feature-dialogs.tsx";
import { defineFeature, type Feature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { StudioWindow } from "../window/studio-window.tsx";
import { StudioWorkspace } from "../window/studio-workspace.ts";
import type { PanelWindowViewProps } from "./panel-window-slot.tsx";

let media: FakeMediaQueries;
let restore: (() => void)[] = [];

beforeEach(() => {
  media = new FakeMediaQueries(1440);
  restore = [media.install(), fakeShowModal(), installFakePopover()];
});

afterEach(() => {
  unmountAll();
  for (const undo of restore) undo();
});

/** A panel as the Assistant draws it: the kit's frame named by the title, focus in its box. */
function NotesPanel({ title, onClose }: PanelWindowViewProps) {
  const box = useRef<HTMLTextAreaElement>(null);
  return (
    <SidePanel
      title="Draft"
      label={title}
      initialFocus={box}
      onClose={onClose}
      actions={
        <button type="button" className="close-panel" onClick={onClose}>
          Close
        </button>
      }
    >
      <textarea ref={box} aria-label="Message" />
    </SidePanel>
  );
}

/** Buttons that toggle the panel through the context, as a command or its shortcut would. */
function ToggleDialogs({ context }: DialogHostProps) {
  return (
    <button type="button" className="toggle" onClick={() => context.panelWindow?.toggle()}>
      Toggle
    </button>
  );
}

function panelFeature(id: string, title: string, order: number): Feature {
  return defineFeature({
    id,
    title,
    register(studio) {
      studio.panelWindows.add({
        id: `${id}.panel`,
        order,
        title,
        keys: "Ctrl+Alt+I",
        view: "NotesPanel",
        load: async () => ({ NotesPanel }),
      });
      studio.dialogs.add({
        id: `${id}.dialogs`,
        order,
        view: "ToggleDialogs",
        load: async () => ({ ToggleDialogs }),
      });
    },
  });
}

const assistant = panelFeature("assistant", "Assistant", 10);

async function renderWindow(features: readonly Feature[] = [assistant]) {
  const shell = createShell({ features, timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  const container = render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="windows"
      language="en"
    />,
  );
  await settle();
  // The panel's button ends the title bar; under 900px the menu button controls the sidebar.
  const button = () =>
    [...container.querySelectorAll<HTMLButtonElement>("header button[aria-controls]")].at(-1) ??
    null;
  const panel = () => container.querySelector<HTMLElement>("[data-panel-window]");
  return { container, button, panel };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function press(element: HTMLElement | null) {
  act(() => element?.click());
  await settle();
}

function pressEscape() {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
}

verifies("shell.panel-window", () => {
  it("starts closed, and the button opens it at the right of the content area, 360px wide", async () => {
    const { button, panel } = await renderWindow();
    expect(panel()).toBeNull();

    await press(button());

    expect(panel()?.className).toContain("w-panel");
    expect(panel()?.previousElementSibling?.contains(document.querySelector("main"))).toBe(true);
    expect(panel()?.querySelector("aside")?.getAttribute("aria-label")).toBe("Assistant");
    expect(button()?.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Message");
  });

  it("closes with Esc only while focus is inside it, and gives focus back to its opener", async () => {
    const { container, button, panel } = await renderWindow();
    const opener = container.querySelector<HTMLButtonElement>("button.toggle");
    opener?.focus();
    await press(opener);

    expect(document.activeElement?.getAttribute("aria-label")).toBe("Message");

    pressEscape();
    await settle();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(button()?.getAttribute("aria-expanded")).toBe("false");
  });

  it("stays open on Esc while focus is in the page", async () => {
    const { container, panel, button } = await renderWindow();
    await press(button());
    container.querySelector<HTMLButtonElement>("button.toggle")?.focus();

    pressEscape();

    expect(panel()).not.toBeNull();
  });

  it("gives focus to the title bar button when its opener has gone", async () => {
    const { button, panel } = await renderWindow();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    await press(button());
    opener.remove();

    await press(panel()?.querySelector<HTMLButtonElement>("button.close-panel") ?? null);

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it("covers the content area under 900px with the page inert, and frees the page when it closes", async () => {
    media.resize(800);
    const { button, panel } = await renderWindow();

    await press(button());
    expect(panel()?.className).toContain("absolute inset-0");
    expect(document.querySelector("main")?.closest("[inert]")).not.toBeNull();

    await press(button());
    expect(panel()).toBeNull();
    expect(document.querySelector("main")?.closest("[inert]")).toBeNull();
  });

  it("draws no side panel on a phone, and draws it again on a wide window", async () => {
    const { button, panel } = await renderWindow();
    await press(button());

    act(() => media.resize(390));
    expect(panel()).toBeNull();

    act(() => media.resize(1440));
    expect(panel()).not.toBeNull();
  });

  it("opens and closes through the context's panelWindow", async () => {
    const { container, panel } = await renderWindow();
    const toggle = () => press(container.querySelector<HTMLButtonElement>("button.toggle"));

    await toggle();
    expect(panel()).not.toBeNull();
    await toggle();
    expect(panel()).toBeNull();
  });

  it("draws the first panel window by order", async () => {
    const { button } = await renderWindow([
      panelFeature("notes", "Notes", 20),
      panelFeature("assistant", "Assistant", 10),
    ]);

    expect(button()?.textContent).toBe("Assistant");
  });
});

verifies("shell.title-bar", () => {
  it("ends the title bar with the panel's button, its keys named, as a toggle", async () => {
    const { container, button } = await renderWindow();
    const header = container.querySelector("header");

    expect(header?.lastElementChild?.contains(button())).toBe(true);
    expect(button()?.textContent).toBe("Assistant");
    // ✦ is an icon, not a character Inter lacks; hidden, so the button's name stays "Assistant".
    const spark = button()?.querySelector('span[aria-hidden="true"].text-accent > svg');
    expect(spark?.getAttribute("fill")).toBe("currentColor");
    expect(button()?.getAttribute("aria-expanded")).toBe("false");
    expect(button()?.getAttribute("aria-keyshortcuts")).toBe("Control+Alt+I");
    act(() => button()?.focus());
    const tooltip = [...document.querySelectorAll("[popover]")].find((each) =>
      each.textContent?.startsWith("Assistant"),
    );
    expect(tooltip?.textContent).toContain("Assistant");
    expect([...(tooltip?.querySelectorAll("kbd") ?? [])].map((key) => key.textContent)).toEqual([
      "Ctrl",
      "Alt",
      "I",
    ]);

    await press(button());
    expect(button()?.getAttribute("aria-expanded")).toBe("true");
  });

  it("has no button after the window tabs while no feature adds a panel window", async () => {
    const { button, container } = await renderWindow([]);

    expect(button()).toBeNull();
    expect(container.querySelector("header .text-accent > svg")).toBeNull();
  });
});
