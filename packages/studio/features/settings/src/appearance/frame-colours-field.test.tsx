// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisplaySettings } from "../display-settings.ts";
import { change, control, typeAndLeave } from "../test-support/controls.ts";
import { MemoryDisplayPrefs } from "../test-support/memory-display-prefs.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { frameColoursPref } from "./appearance-prefs.ts";
import { FrameColoursField } from "./frame-colours-field.tsx";
import { saveSetting } from "./save-setting.ts";

afterEach(unmountAll);

function setup() {
  const prefs = new MemoryDisplayPrefs();
  const settings = new DisplaySettings(prefs);
  const announce = vi.fn();
  const view = render(
    <FrameColoursField settings={settings} save={saveSetting(settings, announce)} />,
  );
  return { prefs, settings, announce, view };
}

const colourInputs = (view: HTMLElement) =>
  [...view.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])')].filter(
    (input) => !input.closest("[popover]"),
  );

verifies("settings.appearance-section", () => {
  it("lists the four presets, then Your own, and saves a pick", async () => {
    const { settings, view } = setup();
    const select = control<HTMLSelectElement>(view, "select");
    expect([...select.options].map((option) => option.text)).toEqual([
      "Blue and purple",
      "Green and blue",
      "Yellow and orange",
      "Pink and violet",
      "Your own",
    ]);
    await change(select, "pink-and-violet");
    expect(settings.get(frameColoursPref)).toEqual({ preset: "pink-and-violet" });
    expect(colourInputs(view)).toEqual([]);
  });
});

verifies("settings.appearance-own-colours", () => {
  it("starts Your own from the colours of the preset picked before", async () => {
    const { settings, view } = setup();
    await change(control(view, "select"), "green-and-blue");
    await change(control(view, "select"), "own");
    expect(settings.get(frameColoursPref)).toEqual({
      preset: "own",
      colours: ["#10B981", "#3B8BFF"],
    });
    expect(colourInputs(view).map((input) => input.value)).toEqual(["#10B981", "#3B8BFF"]);
    expect(
      view.querySelector('[aria-label="Choose the first colour, now #10B981"]'),
    ).not.toBeNull();
  });

  it("takes a typed colour in any case, with or without #, when you leave the field", async () => {
    const { settings, view } = setup();
    await change(control(view, "select"), "own");
    const [, second] = colourInputs(view);
    await typeAndLeave(second as HTMLInputElement, "22d3ee");
    expect(settings.get(frameColoursPref)).toEqual({
      preset: "own",
      colours: ["#3B8BFF", "#22D3EE"],
    });
    expect(second?.value).toBe("#22D3EE");
  });

  it("says how to write a colour and keeps the last good one", async () => {
    const { settings, view } = setup();
    await change(control(view, "select"), "own");
    const [first] = colourInputs(view);
    await typeAndLeave(first as HTMLInputElement, "blue");
    expect(view.textContent).toContain("Enter a colour like #3B8BFF.");
    expect(first?.getAttribute("aria-invalid")).toBe("true");
    expect(settings.get(frameColoursPref)).toEqual({
      preset: "own",
      colours: ["#3B8BFF", "#B05ED9"],
    });
    expect(
      view.querySelector('[aria-label="Choose the first colour, now #3B8BFF"]'),
    ).not.toBeNull();
  });
});

describe("a failed save", () => {
  verifies("settings.failed-save", () => {
    it("puts the frame colours back and says so", async () => {
      const { prefs, announce, view } = setup();
      prefs.failNext(new Error("read-only profile"));
      await change(control(view, "select"), "yellow-and-orange");
      expect(control<HTMLSelectElement>(view, "select").value).toBe("blue-and-purple");
      expect(view.textContent).toContain("Couldn't save the frame colours on this computer.");
      expect(announce).toHaveBeenCalledWith(
        "Couldn't save the frame colours on this computer. Frame colours are back to Blue and purple.",
      );
    });
  });
});
