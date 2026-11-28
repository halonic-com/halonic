import { readFile } from "node:fs/promises";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "../fake-studio.test-helper.ts";
import { placePages } from "../place-words.ts";
import { closeSettingsLabel, screenText } from "../words.ts";
import { placesOpen } from "./places-open.ts";

/**
 * A workspace whose Places list opens each place, which then shows `pageText`
 * of it; its × closes the Settings dialog an earlier step left open.
 */
function studioWithPlaces(pageText: (name: string) => string): FakeStudio {
  const studio = fakeStudio("Settings");
  const main = () => studio.windows.get("main") ?? { text: "", buttons: new Map() };
  button(studio, "main", closeSettingsLabel, () => {
    main().text = "Acme";
  });
  // As in the app: the places are rows in the list the Places button opens, which a pick closes.
  button(studio, "main", screenText.places.text, () => {
    for (const { place } of placePages) {
      button(studio, "main", place.text, () => {
        main().text = pageText(place.text);
        for (const other of placePages) main().buttons.delete(other.place.text);
      });
    }
  });
  return studio;
}

const repo = new URL("../../../../../", import.meta.url);

/** Each place's first expected text, and its wide text, so its page shows as it should. */
function shownPage(name: string): string {
  const page = placePages.find((each) => each.place.text === name);
  return [page?.shows[0]?.text, page?.wide?.text].filter((text) => text !== undefined).join(" ");
}

verifies("studio-click-test.places-open", () => {
  describe("step 22, the places open", () => {
    it("closes Settings, then opens each place from the Places list and passes on its text", async () => {
      const studio = studioWithPlaces(shownPage);
      await expect(placesOpen.run(studio.context)).resolves.toEqual({ passed: true });
      const places = placePages.flatMap(({ place }) => [screenText.places.text, place.text]);
      expect(studio.clicks).toEqual([closeSettingsLabel, ...places]);
    });

    it("passes Changes on any state of a workspace's history", async () => {
      const changes = placePages.find((page) => page.place.text === "Changes");
      for (const state of changes?.shows ?? []) {
        const studio = studioWithPlaces((name) =>
          name === "Changes" ? state.text : shownPage(name),
        );
        await expect(placesOpen.run(studio.context)).resolves.toEqual({ passed: true });
      }
    });

    it("checks every place after a failure, with the first failure's code", async () => {
      const studio = studioWithPlaces((name) => {
        if (name === "Inbox") return "Couldn't load the Inbox";
        if (name === "Changes") return "Changes";
        return shownPage(name);
      });
      const outcome = await placesOpen.run(studio.context);
      expect(outcome).toEqual({
        passed: false,
        code: "INBOX_LOAD_FAILED",
        note: "Inbox: Couldn't load the Inbox\nChanges: Changes",
      });
    });

    it("widens the window to see the Runs page's content pane, then gives the size back", async () => {
      const studio = studioWithPlaces(shownPage);
      await expect(placesOpen.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.resizes).toEqual([
        { width: 1280, height: 800 },
        { width: 800, height: 600 },
      ]);
    });

    it("fails as NO_RUNS_WIDE_PAGE when a wide window shows no content pane beside the list", async () => {
      const runs = placePages.find((page) => page.place.text === "Runs");
      const studio = studioWithPlaces((name) =>
        name === "Runs" ? (runs?.shows[0]?.text ?? "") : shownPage(name),
      );
      const outcome = await placesOpen.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_RUNS_WIDE_PAGE" });
      expect(outcome.passed ? "" : outcome.note).toContain("Runs, in a wide window:");
      expect(studio.windowSize).toEqual({ width: 800, height: 600 });
    });

    const texts = placePages.flatMap((page) => [
      page.place,
      ...page.shows,
      ...(page.failed === undefined ? [] : [page.failed]),
      ...(page.wide === undefined ? [] : [page.wide]),
    ]);
    it.each(texts)("reads $text from $file, which still holds it", async ({ text, file }) => {
      const source = await readFile(new URL(file, repo), "utf8");
      expect(source).toContain(text);
    });

    it("fails as NO_<PLACE>_PAGE when a place isn't in the list", async () => {
      const studio = fakeStudio("Acme");
      const outcome = await placesOpen.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_INBOX_PAGE" });
      expect(outcome.passed ? "" : outcome.note).toContain("Library: not in the Places list.");
    });
  });
});
