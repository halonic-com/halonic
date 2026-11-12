// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisplaySettings } from "../display-settings.ts";
import { MemoryDisplayPrefs } from "../test-support/memory-display-prefs.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { agentCharactersPref, panelOpacityPref, themePref } from "./appearance-prefs.ts";
import { AppearanceView } from "./appearance-section.tsx";

afterEach(unmountAll);

function setup() {
  const prefs = new MemoryDisplayPrefs();
  const settings = new DisplaySettings(prefs);
  const announce = vi.fn();
  const view = render(<AppearanceView settings={settings} announce={announce} />);
  return { prefs, settings, announce, view };
}

function control<Element extends HTMLElement>(view: HTMLElement, selector: string): Element {
  const found = view.querySelector<Element>(selector);
  if (found === null) {
    throw new Error(`Nothing matches ${selector}`);
  }
  return found;
}

/**
 * Sets a native control's value as the browser does, past React's own record of it, so React sees
 * the change.
 */
function setNativeValue(element: HTMLSelectElement | HTMLInputElement, value: string) {
  const prototype = Object.getPrototypeOf(element) as object;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
}

/** Picks `value` in a native select, or moves a range input there and lets go. */
async function change(element: HTMLSelectElement | HTMLInputElement, value: string) {
  await act(async () => {
    setNativeValue(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
}

verifies("settings.appearance-section", () => {
  it("shows the stored values under their labels", () => {
    const { prefs, view } = setup();
    expect(view.textContent).toContain("Theme");
    expect(control<HTMLSelectElement>(view, "select").value).toBe("system");
    expect(control<HTMLInputElement>(view, '[type="range"]').getAttribute("aria-valuetext")).toBe(
      "80%",
    );
    expect(view.textContent).toContain(
      "How much of the frame shows through the sidebar, the page and the tabs.",
    );
    expect(control<HTMLInputElement>(view, '[role="switch"]').checked).toBe(true);
    expect(view.textContent).toContain("Show agents as orbs. Off shows initials.");
    expect(prefs.stored.size).toBe(0);
  });

  it("saves a picked theme by itself", async () => {
    const { settings, view } = setup();
    await change(control(view, "select"), "dark");
    expect(settings.get(themePref)).toBe("dark");
  });

  it("follows the slider while it moves and saves it when it lets go", async () => {
    const { prefs, settings, view } = setup();
    const slider = control<HTMLInputElement>(view, '[type="range"]');
    await act(async () => {
      setNativeValue(slider, "0.5");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(settings.get(panelOpacityPref)).toBe(0.5);
    expect(prefs.stored.has(panelOpacityPref.key)).toBe(false);
    await act(async () => slider.dispatchEvent(new Event("change", { bubbles: true })));
    expect(prefs.stored.get(panelOpacityPref.key)).toBe(0.5);
  });

  it("puts the stored opacity back when the slider loses focus mid-drag", async () => {
    const { prefs, settings, view } = setup();
    const slider = control<HTMLInputElement>(view, '[type="range"]');
    await act(async () => {
      setNativeValue(slider, "0.5");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("blur"));
    });
    expect(settings.get(panelOpacityPref)).toBe(0.8);
    expect(prefs.stored.has(panelOpacityPref.key)).toBe(false);
  });

  it("puts the stored opacity back when the pointer is cancelled mid-drag", async () => {
    const { settings, view } = setup();
    const slider = control<HTMLInputElement>(view, '[type="range"]');
    await act(async () => {
      setNativeValue(slider, "0.5");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("pointercancel"));
    });
    expect(settings.get(panelOpacityPref)).toBe(0.8);
  });

  it("puts the stored opacity back when the dialog closes mid-drag", async () => {
    const { settings, view } = setup();
    const slider = control<HTMLInputElement>(view, '[type="range"]');
    await act(async () => {
      setNativeValue(slider, "0.5");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    unmountAll();
    expect(settings.get(panelOpacityPref)).toBe(0.8);
  });

  it("keeps a saved opacity when the slider loses focus after the drag", async () => {
    const { settings, view } = setup();
    const slider = control<HTMLInputElement>(view, '[type="range"]');
    await change(slider, "0.5");
    await act(async () => slider.dispatchEvent(new Event("blur")));
    expect(settings.get(panelOpacityPref)).toBe(0.5);
  });

  it("turns agent characters off", async () => {
    const { settings, view } = setup();
    await click(control(view, '[role="switch"]'));
    expect(settings.get(agentCharactersPref)).toBe(false);
  });
});

describe("a failed save", () => {
  verifies("settings.failed-save", () => {
    it("puts the theme back, says so under it and in the dialog", async () => {
      const { prefs, announce, view } = setup();
      prefs.failNext(new Error("read-only profile"));
      await change(control(view, "select"), "dark");
      expect(control<HTMLSelectElement>(view, "select").value).toBe("system");
      expect(view.textContent).toContain("Couldn't save the theme on this computer.");
      expect(announce).toHaveBeenCalledWith(
        "Couldn't save the theme on this computer. Theme is back to System.",
      );
      await change(control(view, "select"), "light");
      expect(view.textContent).not.toContain("Couldn't save");
    });

    it("puts agent characters back", async () => {
      const { prefs, announce, view } = setup();
      prefs.failNext(new Error("read-only profile"));
      await click(control(view, '[role="switch"]'));
      expect(control<HTMLInputElement>(view, '[role="switch"]').checked).toBe(true);
      expect(announce).toHaveBeenCalledWith(
        "Couldn't save agent characters on this computer. Agent characters are back on.",
      );
    });

    it("puts the panel opacity back", async () => {
      const { prefs, announce, view } = setup();
      prefs.failNext(new Error("read-only profile"));
      await change(control(view, '[type="range"]'), "0.3");
      expect(view.textContent).toContain("Couldn't save the panel opacity on this computer.");
      expect(announce).toHaveBeenCalledWith(
        "Couldn't save the panel opacity on this computer. Panel opacity is back to 80%.",
      );
    });
  });
});
