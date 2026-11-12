// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { StudioHost } from "../engine/engine-words.ts";
import { defineFeature } from "../feature.ts";
import type { HomeCardProps } from "../home/home-page.tsx";
import type { SettingsScope } from "../points/frame.ts";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { StudioWindow } from "../window/studio-window.tsx";
import { StudioWorkspace } from "../window/studio-workspace.ts";
import type { SettingsSectionProps } from "./settings-dialog.tsx";

let restoreMedia: () => void;
let restoreModal: () => void;

beforeEach(() => {
  restoreMedia = new FakeMediaQueries(1280).install();
  restoreModal = fakeShowModal();
});

afterEach(() => {
  unmountAll();
  restoreModal();
  restoreMedia();
});

function SectionView({ context }: SettingsSectionProps) {
  return <p className="section-view">{context.services === undefined ? "" : "drawn"}</p>;
}

function section(id: string, title: string, scope: SettingsScope, order: number) {
  return { id, title, scope, order, view: "SectionView", load: async () => ({ SectionView }) };
}

/** Home's card asks for a section, as the Harness page's **Open Settings ›** does. */
function OpenSettingsCard({ context }: HomeCardProps) {
  return (
    <>
      <button type="button" className="open" onClick={() => context.openSettings?.()}>
        Settings
      </button>
      <button
        type="button"
        className="open-assistant"
        onClick={() => context.openSettings?.("assistant")}
      >
        Assistant
      </button>
    </>
  );
}

const sectionsFeature = defineFeature({
  id: "sections",
  title: "Sections",
  register(studio) {
    studio.settings.add(section("appearance", "Appearance", "display", 10));
    studio.settings.add(section("formats", "Formats", "display", 20));
    studio.settings.add(section("assistant", "Assistant", "host", 30));
    studio.home.addCard({
      id: "needs-you",
      view: "OpenSettingsCard",
      load: async () => ({ OpenSettingsCard }),
    });
  },
});

async function renderWindow(host: StudioHost = "desktop-app") {
  const shell = createShell({ features: [sectionsFeature], timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services, name: "Acme" });
  const container = render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host={host}
      platform="windows"
      language="en"
    />,
  );
  await settle();
  return container;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function settingsDialog(): HTMLDialogElement | null {
  return document.querySelector("dialog[open]");
}

function shownSection(): string | undefined {
  return settingsDialog()?.querySelector("section h3")?.textContent ?? undefined;
}

function rowNamed(name: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>("dialog nav button")].find(
    (row) => row.textContent === name,
  );
}

async function pressKeys(init: KeyboardEventInit): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    window.dispatchEvent(event);
  });
  await settle();
  return event;
}

async function click(element: Element | null | undefined) {
  act(() => (element as HTMLElement | null | undefined)?.click());
  await settle();
}

async function closeSettings() {
  act(() => {
    settingsDialog()?.dispatchEvent(new Event("cancel", { cancelable: true }));
  });
  await settle();
}

verifies("shell.settings-window", () => {
  it("opens Settings on Ctrl , in the desktop app, with the sections under their group", async () => {
    await renderWindow();

    const pressed = await pressKeys({ key: ",", code: "Comma", ctrlKey: true });

    expect(pressed.defaultPrevented).toBe(true);
    expect(settingsDialog()).not.toBeNull();
    const headings = [...document.querySelectorAll("dialog nav h3")].map((h) => h.textContent);
    expect(headings).toEqual(["On this computer"]);
    expect(shownSection()).toBe("Appearance");
    expect(settingsDialog()?.querySelector(".section-view")?.textContent).toBe("drawn");
  });

  it("opens on the section asked for, then returns to the one shown last", async () => {
    const container = await renderWindow();

    await click(container.querySelector(".open-assistant"));
    expect(shownSection()).toBe("Assistant");
    await click(rowNamed("Formats"));
    await closeSettings();
    expect(settingsDialog()).toBeNull();

    await click(container.querySelector(".open"));
    expect(shownSection()).toBe("Formats");
  });

  it("does nothing on Ctrl Shift , or Alt, or while a dialog is open", async () => {
    await renderWindow();

    await pressKeys({ key: "<", code: "Comma", ctrlKey: true, shiftKey: true });
    await pressKeys({ key: ",", code: "Comma", ctrlKey: true, altKey: true });
    expect(settingsDialog()).toBeNull();

    await pressKeys({ key: ",", code: "Comma", ctrlKey: true });
    await click(rowNamed("Assistant"));
    await pressKeys({ key: ",", code: "Comma", ctrlKey: true });
    expect(shownSection()).toBe("Assistant");
  });

  it("reads the comma by its place on a layout that types no Latin letters", async () => {
    await renderWindow();

    await pressKeys({ key: "б", code: "Comma", ctrlKey: true });

    expect(settingsDialog()).not.toBeNull();
  });

  it("leaves Ctrl , to the browser in served Studio", async () => {
    await renderWindow("served");

    const pressed = await pressKeys({ key: ",", code: "Comma", ctrlKey: true });

    expect(pressed.defaultPrevented).toBe(false);
    expect(settingsDialog()).toBeNull();
  });
});
