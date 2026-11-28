import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { drawStyles, type FakeStudio, fakeStudio } from "../fake-studio.test-helper.ts";
import { keys } from "../webdriver.ts";
import { quickAskBoxLook, quickAskParts } from "./quick-ask-look.ts";

/** The dark ring, as the computed `box-shadow` writes it. */
const ring = "rgb(53, 60, 76) 0px 0px 0px 1px";

/** The box's computed `box-shadow` in dark: the ring, then `shadow-3`'s edge and two layers. */
const ringAndShadow = [
  ring,
  "rgba(255, 255, 255, 0.07) 0px 0px 0px 1px",
  "rgba(0, 0, 0, 0.6) 0px 24px 48px -12px",
  "rgba(0, 0, 0, 0.4) 0px 4px 12px -4px",
].join(", ");

/** A fake Studio whose `ask` window draws the box as the kit does, unless the values differ. */
function withBox(
  box: Readonly<Record<string, string>> = {},
  messageBox: Readonly<Record<string, string>> = {},
): FakeStudio {
  const studio = fakeStudio();
  studio.windows.set("ask", { text: "", buttons: new Map([[keys.escape, () => undefined]]) });
  drawStyles(studio, quickAskParts.box, {
    "border-top-left-radius": "8px",
    "box-shadow": ringAndShadow,
    ...box,
  });
  drawStyles(studio, quickAskParts.messageBox, {
    "border-top-left-radius": "26px",
    ...messageBox,
  });
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

    it("waits for the chip while the box still shows its skeleton", async () => {
      const studio = withBox();
      studio.elements.delete(quickAskParts.chip);
      // The agents arrive during the first wait.
      const context = {
        ...studio.context,
        sleep: async () => {
          studio.elements.set(quickAskParts.chip, 1);
        },
      };
      await expect(quickAskBoxLook.run(context)).resolves.toEqual({ passed: true });
    });

    it("fails as QUICK_ASK_LOOK naming each value that differs", async () => {
      const studio = withBox({ "border-top-left-radius": "0px", "box-shadow": "none" });
      await expect(quickAskBoxLook.run(studio.context)).resolves.toEqual({
        passed: false,
        code: "QUICK_ASK_LOOK",
        note: "box border-top-left-radius 0px, not 8px; box has no dialog shadow.",
      });
    });

    it("fails as QUICK_ASK_LOOK when only the ring is left of the shadow", async () => {
      const studio = withBox({ "box-shadow": ring });
      await expect(quickAskBoxLook.run(studio.context)).resolves.toEqual({
        passed: false,
        code: "QUICK_ASK_LOOK",
        note: "box has no dialog shadow.",
      });
    });

    it("fails as QUICK_ASK_LOOK when the message box lost its 26px corners", async () => {
      const studio = withBox({}, { "border-top-left-radius": "8px" });
      await expect(quickAskBoxLook.run(studio.context)).resolves.toEqual({
        passed: false,
        code: "QUICK_ASK_LOOK",
        note: "messageBox border-top-left-radius 8px, not 26px.",
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
