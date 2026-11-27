// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { DisplaySettings } from "../display-settings.ts";
import { MemoryDisplayPrefs } from "../test-support/memory-display-prefs.ts";
import { agentCharactersPref, panelOpacityPref, themePref } from "./appearance-prefs.ts";
import { watchAppearance } from "./apply-appearance.ts";

const stops: (() => void)[] = [];

afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
});

/** Follows the settings on a fresh root element, as the window does on `<html>`. */
function watch(stored: Record<string, unknown> = {}) {
  const prefs = new MemoryDisplayPrefs();
  for (const [key, value] of Object.entries(stored)) {
    prefs.stored.set(key, value);
  }
  const settings = new DisplaySettings(prefs);
  const root = document.createElement("html");
  stops.push(watchAppearance(settings, root));
  return { prefs, settings, root };
}

function halo(root: HTMLElement) {
  return [root.style.getPropertyValue("--halo-blue"), root.style.getPropertyValue("--halo-violet")];
}

verifies("settings.appearance-theme", () => {
  it("sets the theme on the root at once, and none for System", async () => {
    const { settings, root } = watch();
    expect(root.hasAttribute("data-theme")).toBe(false);
    await settings.set(themePref, "dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    await settings.set(themePref, "system");
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  it("starts from System when the stored theme isn't one of the three", () => {
    const { settings, root } = watch({ [themePref.key]: "sepia" });
    expect(settings.get(themePref)).toBe("system");
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  it("follows a theme another window stored", () => {
    const { prefs, root } = watch();
    prefs.changeElsewhere(themePref.key, "light");
    expect(root.getAttribute("data-theme")).toBe("light");
  });
});

verifies("settings.appearance-section", () => {
  it("leaves the halo colours to the kit, even with frame colours stored before they went", () => {
    const { root } = watch({
      "appearance.frame-colours": { preset: "own", colours: ["#EC4899", "#8B5CF6"] },
    });
    expect(halo(root)).toEqual(["", ""]);
  });
});

verifies("settings.appearance-panel-opacity", () => {
  it("gives the window 80% by default", () => {
    const { root } = watch();
    expect(root.style.getPropertyValue("--panel-opacity")).toBe("0.8");
  });

  it.each([
    [0.64, 0.6],
    [0.05, 0.1],
    [2, 1],
    [0.7, 0.7],
    ["high", 0.8],
    [Number.NaN, 0.8],
  ])("reads the stored %s as %s", (stored, expected) => {
    const { settings } = watch({ [panelOpacityPref.key]: stored });
    expect(settings.get(panelOpacityPref)).toBe(expected);
  });

  it("changes the window's panel opacity when it is set", async () => {
    const { settings, root } = watch();
    await settings.set(panelOpacityPref, 0.3);
    expect(root.style.getPropertyValue("--panel-opacity")).toBe("0.3");
  });
});

verifies("settings.display-prefs", () => {
  it("starts Agent characters on, and from on when the stored value isn't true or false", () => {
    expect(watch().settings.get(agentCharactersPref)).toBe(true);
    expect(watch({ [agentCharactersPref.key]: "off" }).settings.get(agentCharactersPref)).toBe(
      true,
    );
    expect(watch({ [agentCharactersPref.key]: false }).settings.get(agentCharactersPref)).toBe(
      false,
    );
  });
});
