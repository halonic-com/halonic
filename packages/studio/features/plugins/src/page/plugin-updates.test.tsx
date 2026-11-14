// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { noActions, noSettings, weather } from "../test-support/plugins.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { PluginActions, PluginUpdateCheck } from "./plugin-actions.ts";
import { PluginPage } from "./plugin-page.tsx";
import type { InstalledPlugin } from "./plugin-pages.ts";

let removePopover = () => {};
let toasts = createToastStore();
beforeEach(() => {
  toasts = createToastStore();
  fakeModal();
  removePopover = installFakePopover();
});
afterEach(() => {
  unmountAll();
  restoreModal();
  removePopover();
});

function newer(): Extract<PluginUpdateCheck, { kind: "available" }> {
  const manifest = weather().manifest;
  if (manifest === undefined) throw new Error("bad fixture");
  return { kind: "available", manifest: { ...manifest, version: "1.3.0" }, toCommit: "8be41d0" };
}

async function show(plugin: InstalledPlugin, actions: Partial<PluginActions>) {
  const view = render(
    <ToastStoreProvider store={toasts}>
      <PluginPage
        plugin={plugin}
        {...noSettings()}
        actions={{ ...noActions().actions, ...actions }}
        onOpenPanel={() => {}}
      />
    </ToastStoreProvider>,
  );
  await act(async () => {});
  return view;
}

function button(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button:not([role=menuitem])")].find(
    (candidate) => candidate.textContent?.trim().startsWith(name) === true,
  );
}

async function press(name: string) {
  const found = button(name);
  if (found === undefined) throw new Error(`No button ${name}`);
  await act(async () => found.click());
}

verifies("plugins.plugin-updates", () => {
  it("offers Check for updates to a git plugin that is on, and Update from folder to a folder one", async () => {
    await show(weather(), {});
    expect(button("Check for updates")).toBeDefined();
    expect(button("Update from folder")).toBeUndefined();

    unmountAll();
    await show({ ...weather(), origin: { kind: "folder", path: "./weather" } }, {});
    expect(button("Update from folder")).toBeDefined();
    expect(button("Check for updates")).toBeUndefined();
  });

  it("offers neither to a plugin that isn't on or has no source", async () => {
    await show(weather("not-trusted"), {});
    expect(button("Check for updates")).toBeUndefined();

    unmountAll();
    await show({ ...weather(), origin: undefined }, {});
    expect(button("Check for updates")).toBeUndefined();
  });

  it("turns into Up to date when nothing is newer", async () => {
    await show(weather(), { checkForUpdate: async () => ({ kind: "up-to-date" }) });

    await press("Check for updates");

    expect(button("Check for updates")).toBeUndefined();
    expect(document.body.textContent).toContain("Up to date (1.2.0)");
  });

  it("opens the update check with Keep focused, and Keep leaves everything as it was", async () => {
    const found = newer();
    let applied = 0;
    await show(weather(), {
      checkForUpdate: async () => found,
      applyUpdate: async () => {
        applied += 1;
      },
    });

    await press("Check for updates");

    expect(document.body.textContent).toContain("Update Weather to 1.3.0?");
    expect(document.body.textContent).toContain("3f9c2a1");
    expect(document.body.textContent).toContain("8be41d0");
    expect(button("Keep 1.2.0")).toBeDefined();
    expect(button("Trust and update")).toBeDefined();

    await press("Keep 1.2.0");

    expect(applied).toBe(0);
    expect(document.body.textContent).not.toContain("Update Weather to 1.3.0?");
    expect(document.body.textContent).toContain("Up to date (1.2.0)");
  });

  it("updates and closes on Trust and update, and stays open with the reason when it can't", async () => {
    const found = newer();
    const asked: string[] = [];
    let fail = true;
    await show(weather(), {
      checkForUpdate: async () => found,
      applyUpdate: async (plugin) => {
        asked.push(plugin);
        if (fail) throw new Error("The disk is full.");
      },
    });
    await press("Check for updates");

    await press("Trust and update");
    // The kit fills its alert a frame after the error arrives.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(document.querySelector('dialog [role="alert"]')?.textContent).toContain(
      "Couldn't update: The disk is full. The plugin stays as it was.",
    );
    expect(button("Keep 1.2.0")).toBeDefined();

    fail = false;
    await press("Trust and update");

    expect(asked).toEqual(["weather", "weather"]);
    expect(document.body.textContent).not.toContain("Update Weather to 1.3.0?");
  });

  it("says why in a toast when the source can't be looked at, and brings the button back", async () => {
    await show(weather(), {
      checkForUpdate: async () => {
        throw new Error("You're offline.");
      },
    });

    await press("Check for updates");

    expect(toasts.list().map((toast) => toast.title)).toEqual([
      "Couldn't check for updates: you're offline.",
    ]);
    expect(button("Check for updates")).toBeDefined();
  });
});
