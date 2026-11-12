// @vitest-environment jsdom

import { haloPresets } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { DisplaySettings } from "../display-settings.ts";
import { MemoryDisplayPrefs } from "../test-support/memory-display-prefs.ts";
import {
  agentCharactersPref,
  frameColoursPref,
  framePresets,
  panelOpacityPref,
  themePref,
} from "./appearance-prefs.ts";
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

verifies("settings.appearance-frame-colours", () => {
  it("shows Blue and purple by default, and only in the two halo colours", () => {
    const { root } = watch();
    expect(halo(root)).toEqual(["#3B8BFF", "#B05ED9"]);
    expect(root.style.getPropertyValue("--color-accent")).toBe("");
    expect(root.style.getPropertyValue("--color-primary")).toBe("");
  });

  it("shows the person's own colours, written as the field shows them", async () => {
    const { settings, root } = watch({
      [frameColoursPref.key]: { preset: "own", colours: ["3b8bff", "#22d3ee"] },
    });
    expect(halo(root)).toEqual(["#3B8BFF", "#22D3EE"]);
    await settings.set(frameColoursPref, { preset: "blue-and-purple" });
    expect(halo(root)).toEqual(["#3B8BFF", "#B05ED9"]);
  });

  it.each([
    ["green-and-blue", ["#10B981", "#3B8BFF"]],
    ["yellow-and-orange", ["#FBBF24", "#F97316"]],
    ["pink-and-violet", ["#EC4899", "#8B5CF6"]],
  ] as const)("shows the %s preset in the two halo colours", async (preset, colours) => {
    const { settings, root } = watch({ [frameColoursPref.key]: { preset } });
    expect(halo(root)).toEqual(colours);
    await settings.set(frameColoursPref, { preset: "blue-and-purple" });
    expect(halo(root)).toEqual(["#3B8BFF", "#B05ED9"]);
  });

  it("offers the kit's four presets, the ones the halo's contrast is checked with", () => {
    expect(framePresets).toBe(haloPresets);
  });

  describe("falls back to Blue and purple", () => {
    it.each([
      ["an own colour that isn't hex", { preset: "own", colours: ["blue", "#22D3EE"] }],
      ["one own colour", { preset: "own", colours: ["#22D3EE"] }],
      ["three own colours", { preset: "own", colours: ["#3B8BFF", "#22D3EE", "#10B981"] }],
      ["an unknown preset", { preset: "sepia" }],
      ["a preset name from an object's prototype", { preset: "toString" }],
      ["text", "blue-and-purple"],
    ])("for %s", (_name, stored) => {
      const { settings } = watch({ [frameColoursPref.key]: stored });
      expect(settings.get(frameColoursPref)).toEqual({ preset: "blue-and-purple" });
    });
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
