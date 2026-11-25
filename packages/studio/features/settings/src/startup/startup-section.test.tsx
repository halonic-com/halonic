// @vitest-environment jsdom
import { createShell, limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { DisplaySettingsService, HostSettingsService, LoginItemService } from "../api.ts";
import { createSettingsFeature, settingsFeature } from "../feature.ts";
import { click } from "../test-support/controls.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { LoginItemAnswer, LoginItemHost } from "./login-item-host.ts";
import { startupAvailable, startupDescription } from "./startup-available.ts";
import { StartupView } from "./startup-section.tsx";

afterEach(unmountAll);

/** A login item that is `on` at first and answers each `set` with `answer`, or as asked. */
function fakeHost(on: boolean, answer?: LoginItemAnswer, iconIn: LoginItemHost["iconIn"] = "tray") {
  return {
    iconIn,
    get: vi.fn(async (): Promise<LoginItemAnswer> => ({ on })),
    set: vi.fn(async (next: boolean): Promise<LoginItemAnswer> => answer ?? { on: next }),
  } satisfies LoginItemHost;
}

/** A Settings context over `host` (or none), through the feature's own `wants`. */
function contextWith(host: LoginItemHost | undefined): WorkspaceContext {
  const find = (key: unknown) => (key === LoginItemService ? host : undefined);
  const services = limitedLookup(settingsFeature, { get: find, find });
  return { services } as unknown as WorkspaceContext;
}

async function show(host: LoginItemHost) {
  const view = render(<StartupView host={host} />);
  await act(async () => {});
  return view;
}

function theSwitch(view: HTMLElement): HTMLInputElement {
  const found = view.querySelector<HTMLInputElement>('[role="switch"]');
  if (found === null) throw new Error(`No switch in: ${view.textContent}`);
  return found;
}

const trayLine =
  "When you close the window, Halonic keeps running in the tray, so your routines keep running. Quit it from its icon to stop everything.";
const trayHint =
  "Halonic starts in the tray without opening a window, and runs the routines of the workspaces you had open when you last quit. Off, routines run only after you open Halonic.";

verifies("settings.startup-section", () => {
  it("is absent without a login item, and shows with one", () => {
    const heard: boolean[] = [];
    startupAvailable(contextWith(undefined), (available) => heard.push(available))();
    startupAvailable(contextWith(fakeHost(false)), (available) => heard.push(available))();

    expect(heard).toEqual([false, true]);
  });

  it("is listed as Startup on this computer, after Trusted sources and before About Halonic", () => {
    const shell = createShell({
      features: [createSettingsFeature(true)],
      hostServices: [DisplaySettingsService, HostSettingsService],
    });
    const sections = shell.contributions.settings.list();
    const startup = sections.find(({ id }) => id === "startup");
    const about = sections.find(({ id }) => id === "about");

    expect(startup).toMatchObject({ title: "Startup", scope: "host" });
    // Trusted sources, from the Workspace feature, is at 40.
    expect(startup?.order).toBeGreaterThan(40);
    expect(startup?.order).toBeLessThan(about?.order ?? 0);
    expect(startup?.available).toBe(startupAvailable);
  });

  it("stays hidden until the background start lands", () => {
    const shell = createShell({
      features: [settingsFeature],
      hostServices: [DisplaySettingsService, HostSettingsService],
    });

    expect(shell.contributions.settings.list().map(({ id }) => id)).not.toContain("startup");
  });

  it("describes the tray, or the menu bar on macOS", () => {
    expect(startupDescription(contextWith(fakeHost(false)))).toBe(trayLine);
    expect(startupDescription(contextWith(fakeHost(false, undefined, "menu-bar")))).toBe(
      trayLine.replace("in the tray", "in the menu bar"),
    );
  });

  it("shows the switch with its hint, off as the shell says, and changes nothing on opening", async () => {
    const host = fakeHost(false);
    const view = await show(host);

    expect(view.textContent).toContain("Start Halonic when I log in");
    expect(view.textContent).toContain(trayHint);
    expect(theSwitch(view).checked).toBe(false);
    expect(host.set).not.toHaveBeenCalled();
  });

  it("says the menu bar in the hint on macOS", async () => {
    const view = await show(fakeHost(false, undefined, "menu-bar"));

    expect(view.textContent).toContain(trayHint.replace("in the tray", "in the menu bar"));
  });

  it("turns the login item on with a press and shows on", async () => {
    const host = fakeHost(false);
    const view = await show(host);

    await click(theSwitch(view));

    expect(host.set).toHaveBeenCalledWith(true);
    expect(theSwitch(view).checked).toBe(true);
    expect(view.querySelector('[role="status"]')?.textContent).toBe("");
  });

  it("says why when Halonic isn't installed, and leaves the switch off", async () => {
    const host = fakeHost(false, { refused: "not_installed" });
    const view = await show(host);

    await click(theSwitch(view));

    expect(host.set).toHaveBeenCalledWith(true);
    expect(theSwitch(view).checked).toBe(false);
    const line = view.querySelector('[role="status"]');
    expect(line?.textContent).toBe(
      "Couldn't turn this on: only an installed Halonic can start when you log in. Install Halonic, then try again.",
    );
    expect(line?.className).toContain("text-danger");
  });

  it("keeps the switch on when turning it off fails", async () => {
    const host = fakeHost(true, { refused: "failed" });
    const view = await show(host);

    await click(theSwitch(view));

    expect(host.set).toHaveBeenCalledWith(false);
    expect(theSwitch(view).checked).toBe(true);
    expect(view.querySelector('[role="status"]')?.textContent).toBe(
      "Couldn't save this setting. Try again.",
    );
  });

  it("shows the failure, with the switch off, when the shell can't say", async () => {
    const host = fakeHost(false);
    host.get.mockRejectedValueOnce(new Error("no answer"));
    const view = await show(host);

    expect(theSwitch(view).checked).toBe(false);
    expect(view.querySelector('[role="status"]')?.textContent).toBe(
      "Couldn't read whether Halonic starts when you log in.",
    );
  });
});
