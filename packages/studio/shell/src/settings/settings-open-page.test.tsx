// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { ItemViewProps } from "../window/item-view.tsx";
import { StudioWindow } from "../window/studio-window.tsx";
import { StudioWorkspace } from "../window/studio-workspace.ts";
import type { SettingsSectionProps } from "./settings-dialog.tsx";

let restore: (() => void)[] = [];

afterEach(() => {
  unmountAll();
  for (const undo of restore.reverse()) {
    undo();
  }
  restore = [];
});

/** A narrow window, 640px wide, as at 200 % zoom on a 1280px screen: the sidebar is the drawer. */
beforeEach(() => {
  restore = [new FakeMediaQueries(640).install(), fakeShowModal(), installFakePopover()];
});

/** Lets the view of Weather's page load, which it does only when the test says so. */
let finishLoading: () => void = () => undefined;

/** A plugin's page, drawn once its view has loaded, as a place's view loads when it first shows. */
function PluginView({ item }: ItemViewProps) {
  return <h1 tabIndex={-1}>{`Plugin ${item.id}`}</h1>;
}

/** Plugins, as the plugins feature's section: its row closes Settings and opens the page. */
function PluginsSection({ context, closeSettings }: SettingsSectionProps) {
  return (
    <button
      type="button"
      className="weather"
      onClick={() => {
        closeSettings();
        context.openItem?.({ kind: "plugin", hub: "plugins", id: "Weather" });
      }}
    >
      Weather
    </button>
  );
}

const pluginsFeature = defineFeature({
  id: "plugins",
  title: "Plugins",
  register(studio) {
    studio.settings.add({
      id: "plugins",
      title: "Plugins",
      scope: "workspace",
      order: 10,
      view: "PluginsSection",
      load: async () => ({ PluginsSection }),
    });
    studio.itemKinds.add({
      kind: "plugin",
      label: "Plugin",
      icon: "plugin",
      open: {
        view: "PluginView",
        load: () =>
          new Promise((resolve) => {
            finishLoading = () => resolve({ PluginView });
          }),
      },
    });
  },
});

async function renderWindow() {
  const shell = createShell({ features: [pluginsFeature], timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services, name: "Acme" });
  render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="windows"
      language="en"
    />,
  );
  await settle();
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function placesButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>('button[aria-label="Places"]');
}

/** Opens the Places drawer and Settings from its Settings row, with a key, as a keyboard user does. */
async function openSettingsFromDrawer() {
  act(() => placesButton()?.click());
  const row = document.querySelector<HTMLElement>('nav[aria-label="Places"] > button');
  act(() => row?.focus());
  act(() => row?.click());
  await settle();
  expect(document.querySelector("dialog[open]")).not.toBeNull();
}

verifies("shell.sidebar-settings", () => {
  it("gives the focus to Places on Escape in a narrow window, where the row is in the closed drawer", async () => {
    await renderWindow();
    await openSettingsFromDrawer();

    act(() => {
      document
        .querySelector("dialog[open]")
        ?.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    await settle();

    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(document.activeElement).toBe(placesButton());
  });

  it("gives the focus to the h1 of a page a section opens, once drawn, not to Places (C383 SP1)", async () => {
    await renderWindow();
    await openSettingsFromDrawer();

    act(() => document.querySelector<HTMLElement>("dialog .weather")?.click());
    await settle();
    expect(document.querySelector("dialog[open]")).toBeNull();
    act(() => finishLoading());
    await settle();

    const heading = [...document.querySelectorAll("main h1")].find(
      (candidate) => candidate.textContent === "Plugin Weather",
    );
    expect(heading).toBeDefined();
    expect(document.activeElement).toBe(heading);
  });
});
