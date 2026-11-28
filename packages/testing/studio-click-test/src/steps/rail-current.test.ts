import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "../fake-studio.test-helper.ts";
import { screenText } from "../words.ts";
import { pickedMessenger, placesNav, railCurrent, railNav, railPages } from "./rail-current.ts";

const home = screenText.homeEntry.text;
const messenger = screenText.messengerEntry.text;

/** A wide window with the rail and the sidebar; clicking Messenger makes it `current`. */
function studioWithRail(current: "true" | "page"): FakeStudio {
  const studio = fakeStudio("Acme");
  studio.elements.set(railNav, 1);
  studio.elements.set(placesNav, 1);
  button(studio, "main", home, () => {
    studio.elements.set(railPages, 1);
    studio.elements.set(pickedMessenger, 0);
  });
  button(studio, "main", messenger, () => {
    studio.elements.set(railPages, current === "page" ? 1 : 0);
    studio.elements.set(pickedMessenger, current === "true" ? 1 : 0);
  });
  return studio;
}

verifies("studio-click-test.rail-current-step", () => {
  describe("the rail step", () => {
    it("passes when a picked Messenger is current but not the page, between two Home clicks", async () => {
      const studio = studioWithRail("true");
      await expect(railCurrent.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks).toEqual([home, messenger, home]);
      expect(studio.resizes).toEqual([
        { width: 1280, height: 800 },
        { width: 800, height: 600 },
      ]);
    });

    it("waits for a pick that shows only on a later read", async () => {
      const studio = studioWithRail("true");
      button(studio, "main", messenger, () => {
        studio.elements.set(railPages, 1);
      });
      // Only a wait after the click turns Messenger current; the workspace's own wait comes before it.
      const context = {
        ...studio.context,
        sleep: async () => {
          if (!studio.clicks.includes(messenger)) return;
          studio.elements.set(railPages, 0);
          studio.elements.set(pickedMessenger, 1);
        },
      };
      await expect(railCurrent.run(context)).resolves.toEqual({ passed: true });
    });

    it("fails as RAIL_LANDMARKS when two navs are named Places", async () => {
      const studio = studioWithRail("true");
      studio.elements.set(railNav, 0);
      studio.elements.set(placesNav, 2);
      const outcome = await railCurrent.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "RAIL_LANDMARKS" });
      expect(studio.clicks).toEqual([]);
    });

    it("fails as RAIL_PICK_IS_PAGE, saying what it saw, and still clicks Home", async () => {
      const studio = studioWithRail("page");
      const outcome = await railCurrent.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "RAIL_PICK_IS_PAGE" });
      expect(outcome.passed ? "" : outcome.note).toContain(
        '0 rail button is aria-current="true" for it and 1 is aria-current="page"',
      );
      expect(studio.clicks).toEqual([home, messenger, home]);
    });
  });
});
