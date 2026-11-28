import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "../fake-studio.test-helper.ts";
import {
  homeEntry,
  messengerEntry,
  pickedMessenger,
  placesNav,
  railCurrent,
  railNav,
  railPages,
} from "./rail-current.ts";

/** A wide window with the rail and the sidebar; clicking Messenger makes it `current`. */
function studioWithRail(current: "true" | "page"): FakeStudio {
  const studio = fakeStudio("Acme");
  studio.elements.set(railNav, 1);
  studio.elements.set(placesNav, 1);
  studio.elements.set(railPages, 1);
  button(studio, "main", messengerEntry, () => {
    studio.elements.set(railPages, current === "page" ? 1 : 0);
    studio.elements.set(pickedMessenger, current === "true" ? 1 : 0);
  });
  button(studio, "main", homeEntry, () => {
    studio.elements.set(railPages, 1);
    studio.elements.set(pickedMessenger, 0);
  });
  return studio;
}

verifies("studio-click-test.rail-current-step", () => {
  describe("the rail step", () => {
    it("passes when a picked Messenger is current but not the page, then clicks Home", async () => {
      const studio = studioWithRail("true");
      await expect(railCurrent.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks).toEqual([messengerEntry, homeEntry]);
      expect(studio.resizes).toEqual([
        { width: 1280, height: 800 },
        { width: 800, height: 600 },
      ]);
    });

    it("fails as RAIL_LANDMARKS when two navs are named Places", async () => {
      const studio = studioWithRail("true");
      studio.elements.set(railNav, 0);
      studio.elements.set(placesNav, 2);
      const outcome = await railCurrent.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "RAIL_LANDMARKS" });
      expect(studio.clicks).toEqual([]);
    });

    it("fails as RAIL_PICK_IS_PAGE when Messenger turns the page, and still clicks Home", async () => {
      const studio = studioWithRail("page");
      const outcome = await railCurrent.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "RAIL_PICK_IS_PAGE" });
      expect(studio.clicks).toEqual([messengerEntry, homeEntry]);
    });
  });
});
