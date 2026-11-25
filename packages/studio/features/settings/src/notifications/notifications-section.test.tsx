// @vitest-environment jsdom
import { HostSettings } from "@halonicjs/app";
import { runNotificationSettingsOf } from "@halonicjs/studio-feature-runs/api";
import { limitedLookup, type SettingsSectionProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { HostSettingsService } from "../api.ts";
import { settingsFeature, settingsSectionsFor } from "../feature.ts";
import { MemoryHostSettingsStore } from "../test-support/memory-host-settings-store.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { NotificationsSection, NotificationsView } from "./notifications-section.tsx";

afterEach(unmountAll);

async function setup() {
  const store = new MemoryHostSettingsStore();
  const settings = new HostSettings(store);
  await settings.load();
  const announce = vi.fn();
  const view = render(<NotificationsView settings={settings} announce={announce} />);
  return { store, settings, announce, view };
}

const switches = (view: HTMLElement) => [
  ...view.querySelectorAll<HTMLInputElement>('[role="switch"]'),
];
const switchNamed = (view: HTMLElement, words: string) => {
  const found = switches(view).find((each) => each.closest("label")?.textContent === words);
  if (found === undefined) throw new Error(`no switch "${words}"`);
  return found;
};

verifies("settings.notifications-section", () => {
  it("shows Runs with the design's three switches, in order, at their defaults", async () => {
    const { view, store } = await setup();
    expect(view.querySelector("h4")?.textContent).toBe("Runs");
    expect(
      switches(view).map((each) => [each.closest("label")?.textContent, each.checked]),
    ).toEqual([
      ["When a run fails", true],
      ["When a run I started finishes", true],
      ["When any run finishes", false],
    ]);
    expect(store.stored.size).toBe(0);
  });

  it("saves a switch by itself, where the run notifications read it", async () => {
    const { view, settings } = await setup();
    await act(async () => switchNamed(view, "When any run finishes").click());
    expect(switchNamed(view, "When any run finishes").checked).toBe(true);
    expect(runNotificationSettingsOf(settings)).toEqual({
      failed: true,
      startedByMeFinished: true,
      anyFinished: true,
    });
  });

  it("puts a switch back and says so under it and in the dialog when the save fails", async () => {
    const { view, store, announce } = await setup();
    store.failSaves = true;
    await act(async () => switchNamed(view, "When a run fails").click());
    expect(switchNamed(view, "When a run fails").checked).toBe(true);
    expect(view.textContent).toContain(`Couldn't save "When a run fails" on this computer.`);
    expect(announce).toHaveBeenCalledWith(
      `Couldn't save "When a run fails" on this computer. It's back on.`,
    );
  });

  it("is a host section named Notifications, after Assistant and before Agent sandbox, hidden until run notifications show", () => {
    expect(settingsSectionsFor(false).map(({ id }) => id)).not.toContain("notifications");
    const sections = settingsSectionsFor(true);
    const notifications = sections.find(({ id }) => id === "notifications");
    expect(notifications).toMatchObject({ title: "Notifications", scope: "host", order: 20 });
  });

  it("says the settings couldn't be read, with Try again, and shows the switches once they are", async () => {
    const store = new MemoryHostSettingsStore();
    const read = vi.spyOn(store, "read").mockRejectedValueOnce(new Error("locked"));
    const settings = new HostSettings(store);
    await settings.load().catch(() => undefined);
    const context = {
      services: limitedLookup(settingsFeature, {
        get: (key) => (key === HostSettingsService ? settings : undefined),
        find: () => undefined,
      }),
      announcer: { announce: vi.fn() },
    } as unknown as SettingsSectionProps["context"];
    const view = render(
      <NotificationsSection
        context={context}
        place="app"
        surface="window"
        closeSettings={() => {}}
      />,
    );
    expect(view.textContent).toContain("Couldn't load the notification settings");
    expect(switches(view)).toEqual([]);
    const tryAgain = [...view.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );
    await act(async () => tryAgain?.click());
    expect(read).toHaveBeenCalledTimes(2);
    expect(switches(view)).toHaveLength(3);
  });
});
