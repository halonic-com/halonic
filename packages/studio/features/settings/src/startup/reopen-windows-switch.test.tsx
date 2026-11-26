// @vitest-environment jsdom
import { HostSettings } from "@halonicjs/app";
import { limitedLookup, type SettingsSectionProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { HostSettingsService, LoginItemService } from "../api.ts";
import { settingsFeature } from "../feature.ts";
import { MemoryHostSettingsStore } from "../test-support/memory-host-settings-store.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { LoginItemHost } from "./login-item-host.ts";
import { reopenWindowsSetting } from "./reopen-windows.ts";
import { ReopenWindowsSwitch } from "./reopen-windows-switch.tsx";
import { StartupSection } from "./startup-section.tsx";

afterEach(unmountAll);

async function setup() {
  const store = new MemoryHostSettingsStore();
  const settings = new HostSettings(store);
  await settings.load();
  const announce = vi.fn();
  const view = render(<ReopenWindowsSwitch settings={settings} announce={announce} />);
  await act(async () => {});
  return { store, settings, announce, view };
}

function theSwitch(view: HTMLElement): HTMLInputElement {
  const found = view.querySelector<HTMLInputElement>('[role="switch"]');
  if (found === null) throw new Error(`No switch in: ${view.textContent}`);
  return found;
}

const loginItem: LoginItemHost = {
  iconIn: "tray",
  get: async () => ({ on: false }),
  set: async (on) => ({ on }),
};

verifies("settings.startup-section", () => {
  it("is the key the desktop shell reads, on when nothing is saved", async () => {
    // `open_windows::SETTING` in the Tauri shell.
    expect(reopenWindowsSetting.key).toBe("windows.reopen-on-start");
    const { view, store } = await setup();

    expect(theSwitch(view).closest("label")?.textContent).toBe("Reopen windows on start");
    expect(theSwitch(view).checked).toBe(true);
    expect(store.stored.size).toBe(0);
  });

  it("saves off with a press, where the shell reads it", async () => {
    const { view, settings } = await setup();

    await act(async () => theSwitch(view).click());

    expect(theSwitch(view).checked).toBe(false);
    expect(settings.get(reopenWindowsSetting)).toBe(false);
  });

  it("puts the switch back and says so when the save fails", async () => {
    const { view, store, announce } = await setup();
    store.failSaves = true;

    await act(async () => theSwitch(view).click());

    expect(theSwitch(view).checked).toBe(true);
    expect(view.textContent).toContain(`Couldn't save "Reopen windows on start" on this computer.`);
    expect(announce).toHaveBeenCalledWith(
      `Couldn't save "Reopen windows on start" on this computer. It's back on.`,
    );
  });

  it("shows both switches in the section, and only why the settings can't be read in place of the second", async () => {
    const store = new MemoryHostSettingsStore();
    vi.spyOn(store, "read").mockRejectedValueOnce(new Error("locked"));
    const settings = new HostSettings(store);
    await settings.load().catch(() => undefined);
    const find = (key: unknown) => {
      if (key === HostSettingsService) return settings;
      return key === LoginItemService ? loginItem : undefined;
    };
    const context = {
      services: limitedLookup(settingsFeature, { get: find, find }),
      announcer: { announce: vi.fn() },
    } as unknown as SettingsSectionProps["context"];
    const view = render(
      <StartupSection context={context} place="app" surface="window" closeSettings={() => {}} />,
    );
    await act(async () => {});

    expect(view.textContent).toContain("Start Halonic when I log in");
    expect(view.textContent).toContain("Couldn't load the startup settings");
    expect(view.textContent).not.toContain("Reopen windows on start");

    const tryAgain = [...view.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );
    await act(async () => tryAgain?.click());

    expect(view.textContent).toContain("Reopen windows on start");
  });
});
