import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  clampPanelWidth,
  PANEL_DEFAULT_WIDTH,
  panelFitsBeside,
  savedPanelWidth,
  shownPanelWidth,
} from "./panel-width.ts";

verifies("shell.panel-width", () => {
  it("starts at 700px with nothing saved", () => {
    expect(savedPanelWidth(undefined)).toBe(PANEL_DEFAULT_WIDTH);
    expect(shownPanelWidth(savedPanelWidth(undefined), 1600)).toBe(700);
  });

  it("starts at the saved width", () => {
    expect(shownPanelWidth(savedPanelWidth(812), 1600)).toBe(812);
  });

  it("starts at 700px when the saved value isn't a number", () => {
    for (const saved of ["812", null, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
      expect(savedPanelWidth(saved)).toBe(700);
    }
  });

  it("keeps a saved width inside 420 to 1400", () => {
    expect(savedPanelWidth(100)).toBe(420);
    expect(savedPanelWidth(5000)).toBe(1400);
  });

  it("stops a drag at 420px and 1400px", () => {
    expect(clampPanelWidth(300)).toBe(420);
    expect(clampPanelWidth(1600)).toBe(1400);
    expect(clampPanelWidth(812.4)).toBe(812);
  });

  it("narrows the panel so the chat keeps 320px, never under 420px", () => {
    expect(shownPanelWidth(812, 1000)).toBe(592);
    expect(shownPanelWidth(812, 828)).toBe(420);
  });

  it("gives the chosen width back when the tab widens", () => {
    const chosen = 812;
    expect(shownPanelWidth(chosen, 1000)).toBe(592);
    expect(shownPanelWidth(chosen, 1300)).toBe(812);
  });

  it("shows no panel beside the chat when a 420px panel doesn't fit", () => {
    expect(panelFitsBeside(800)).toBe(false);
    expect(shownPanelWidth(700, 800)).toBeUndefined();
    expect(panelFitsBeside(827)).toBe(false);
    expect(panelFitsBeside(828)).toBe(true);
    expect(panelFitsBeside(1200)).toBe(true);
  });
});
