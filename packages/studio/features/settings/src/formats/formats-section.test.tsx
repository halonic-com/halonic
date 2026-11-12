// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisplaySettings } from "../display-settings.ts";
import { change, control } from "../test-support/controls.ts";
import { MemoryDisplayPrefs } from "../test-support/memory-display-prefs.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { formatPref } from "./format-pref.ts";
import { FormatsView } from "./formats-section.tsx";

afterEach(unmountAll);

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
