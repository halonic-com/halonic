// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisplaySettings } from "../display-settings.ts";
import { change, click, control, setNativeValue } from "../test-support/controls.ts";
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

  describe("after the section is gone", () => {
    verifies("settings.failed-save", () => {
      it("says the line in a toast, not the dialog's live region", async () => {
        const prefs = new MemoryDisplayPrefs();
        const settings = new DisplaySettings(prefs);
        const announce = vi.fn();
        const toasts = createToastStore();
        const view = render(
          <ToastStoreProvider store={toasts}>
            <AppearanceView settings={settings} announce={announce} />
          </ToastStoreProvider>,
        );
        prefs.holdWrites();
        prefs.failNext(new Error("read-only profile"));
        await change(control(view, '[type="range"]'), "0.3");
        unmountAll();
        await act(async () => prefs.release(0));
        expect(announce).not.toHaveBeenCalled();
        expect(toasts.list().map((toast) => toast.title)).toEqual([
          "Couldn't save the panel opacity on this computer. Panel opacity is back to 80%.",
        ]);
      });
    });
  });
});
