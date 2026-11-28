import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { drawStyles, type FakeStudio, fakeStudio } from "../fake-studio.test-helper.ts";
import { keys } from "../webdriver.ts";
import { quickAskBoxLook, quickAskParts } from "./quick-ask-look.ts";

/** A fake Studio whose `ask` window draws the box as the kit does, unless `box` says otherwise. */
function withBox(box: Readonly<Record<string, string>> = {}): FakeStudio {
  const studio = fakeStudio();
  studio.windows.set("ask", { text: "", buttons: new Map([[keys.escape, () => undefined]]) });
  drawStyles(studio, quickAskParts.box, {
    "border-top-left-radius": "8px",
    "box-shadow": "rgba(0, 0, 0, 0.07) 0px 0px 0px 1px",
    ...box,
  });
  drawStyles(studio, quickAskParts.messageBox, { "border-top-left-radius": "26px" });
  studio.elements.set(quickAskParts.chip, 1);
  studio.elements.set(quickAskParts.ask, 1);
  return studio;
}

verifies("studio-click-test.quick-ask-look", () => {
  describe("quick ask's box", () => {
    it("passes on the panel corner with the kit's message box, then hides the box", async () => {
      const studio = withBox();
      await expect(quickAskBoxLook.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.shortcuts).toEqual(["Halonic --app ask"]);
      expect(studio.clicks).toEqual([keys.escape]);
      expect(studio.current).toBe("main");
    });

    it("fails as QUICK_ASK_LOOK naming each value that differs", async () => {
      const studio = withBox({ "border-top-left-radius": "0px", "box-shadow": "none" });
      await expect(quickAskBoxLook.run(studio.context)).resolves.toEqual({
        passed: false,
        code: "QUICK_ASK_LOOK",
        note: "box border-top-left-radius 0px, not 8px; box has no shadow.",
      });
    });

    it("fails as NO_QUICK_ASK_PART when the chip isn't straight in the message box", async () => {
      const studio = withBox();
      studio.elements.delete(quickAskParts.chip);
      await expect(quickAskBoxLook.run(studio.context)).resolves.toEqual({
        passed: false,
        code: "NO_QUICK_ASK_PART",
        note: "The box has no chip.",
      });
    });

    it("fails as NO_WINDOW when no ask window shows", async () => {
      await expect(quickAskBoxLook.run(fakeStudio().context)).resolves.toMatchObject({
        passed: false,
        code: "NO_WINDOW",
      });
    });
  });
});
