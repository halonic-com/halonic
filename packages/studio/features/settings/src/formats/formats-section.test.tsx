// @vitest-environment jsdom
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DisplaySettings } from "../display-settings.ts";
import { change, click, control } from "../test-support/controls.ts";
import { MemoryDisplayPrefs } from "../test-support/memory-display-prefs.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { formatPref } from "./format-pref.ts";
import { FormatsView } from "./formats-section.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

function setup(place: "app" | "served" = "served") {
  const prefs = new MemoryDisplayPrefs();
  const settings = new DisplaySettings(prefs);
  const announce = vi.fn();
  const view = render(
    <FormatsView settings={settings} announce={announce} place={place} followTag="en-GB" />,
  );
  return { prefs, settings, announce, view };
}

verifies("settings.formats-section", () => {
  it("follows the browser by default and shows the example", () => {
    const { prefs, view } = setup();
    const select = control<HTMLSelectElement>(view, "select");
    expect(select.value).toBe("follow");
    expect(select.selectedOptions[0]?.textContent).toBe(
      "Follow this browser: English (United Kingdom)",
    );
    expect(view.textContent).toContain("45.00 · Mon 9 Nov, 08:00");
    expect(prefs.stored.size).toBe(0);
  });

  it("says this computer in the desktop app", () => {
    const { view } = setup("app");
    expect(control<HTMLSelectElement>(view, "select").selectedOptions[0]?.textContent).toContain(
      "Follow this computer:",
    );
  });

  it("saves a picked format by itself and changes the example", async () => {
    const { prefs, settings, view } = setup();
    await change(control(view, "select"), "nl-NL");
    expect(settings.get(formatPref)).toBe("nl-NL");
    expect(prefs.stored.get(formatPref.key)).toBe("nl-NL");
    expect(view.textContent).toContain("45,00 · ma 9 nov, 08:00");
  });

  describe("a failed save", () => {
    it("puts the format back, says so under it and in the dialog", async () => {
      const { prefs, announce, view } = setup();
      prefs.failNext(new Error("read-only profile"));
      await change(control(view, "select"), "nl-NL");
      expect(control<HTMLSelectElement>(view, "select").value).toBe("follow");
      expect(view.textContent).toContain("Couldn't save the format on this computer.");
      expect(announce).toHaveBeenCalledWith(
        "Couldn't save the format on this computer. Format is back to Follow this browser: English (United Kingdom).",
      );
    });

    it("clears the line at the next good save", async () => {
      const { prefs, view } = setup();
      prefs.failNext(new Error("read-only profile"));
      await change(control(view, "select"), "nl-NL");
      await change(control(view, "select"), "de-DE");
      expect(view.textContent).not.toContain("Couldn't save the format");
    });
  });
});

describe("on the phone's Settings page", () => {
  function setupPhone() {
    const prefs = new MemoryDisplayPrefs();
    const settings = new DisplaySettings(prefs);
    const announce = vi.fn();
    const toasts = createToastStore();
    const view = render(
      <PresentationProvider presentation="phone">
        <ToastStoreProvider store={toasts}>
          <FormatsView
            settings={settings}
            announce={announce}
            place="served"
            surface="phone"
            followTag="en-GB"
          />
        </ToastStoreProvider>
      </PresentationProvider>,
    );
    return { prefs, announce, toasts, view };
  }

  const openSheet = async (view: HTMLElement) => click(control(view, "button"));

  verifies("settings.formats-section", () => {
    it("opens a picker sheet with a search, whose first option follows this phone", async () => {
      const { view } = setupPhone();
      await openSheet(view);
      const sheet = document.body;
      expect(sheet.querySelector('input[type="search"]')).not.toBeNull();
      const first = sheet.querySelector('[role="radiogroup"] input[type="radio"]');
      expect(first?.nextElementSibling?.textContent).toBe(
        "Follow this phone: English (United Kingdom)",
      );
    });

    it("says a failed save in a toast on this phone, not under the choice", async () => {
      const { prefs, announce, toasts, view } = setupPhone();
      prefs.failNext(new Error("read-only profile"));
      await openSheet(view);
      const dutch = [
        ...document.body.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
      ].find((radio) => radio.value === "nl-NL");
      await click(dutch as HTMLElement);
      expect(view.textContent).not.toContain("Couldn't save");
      expect(announce).not.toHaveBeenCalled();
      expect(toasts.list().map((toast) => [toast.title, toast.text])).toEqual([
        [
          "Couldn't save the format on this phone.",
          "Format is back to Follow this phone: English (United Kingdom).",
        ],
      ]);
    });
  });
});
