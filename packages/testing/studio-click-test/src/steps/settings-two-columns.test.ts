import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "../fake-studio.test-helper.ts";
import { buttonLabels, screenText, settingsText } from "../words.ts";
import { settingsColumnParts, settingsTwoColumns } from "./settings-two-columns.ts";

const lightFill = "rgb(240, 240, 243)";
const darkFill = "rgb(39, 39, 42)";
const noFill = "rgba(0, 0, 0, 0)";

interface DrawnDialog {
  readonly listWidth?: string;
  readonly otherFill?: string;
  readonly darkFill?: string;
}

/**
 * Settings on Appearance, with the list 34% of an 800px row and the current row filled, and its
 * Theme options setting the root's `data-theme` and the current row's fill for that theme.
 */
function studioWithColumns(drawn: DrawnDialog = {}): FakeStudio {
  const studio = fakeStudio("Acme");
  const { list, holder, current, other } = settingsColumnParts;
  button(studio, "main", screenText.places.text, () => {
    button(studio, "main", buttonLabels.settings.text, () => {
      button(studio, "main", settingsText.appearance.text, () => {
        for (const part of [list, current, other]) studio.elements.set(part, 1);
        studio.styles.set(`${list} width`, drawn.listWidth ?? "272px");
        studio.styles.set(`${holder} width`, "800px");
        studio.backgrounds.set(current, lightFill);
        studio.backgrounds.set(other, drawn.otherFill ?? noFill);
        button(studio, "main", settingsText.themeDark.text, () => {
          studio.rootAttributes.set("data-theme", "dark");
          studio.backgrounds.set(current, drawn.darkFill ?? darkFill);
        });
        button(studio, "main", settingsText.themeSystem.text, () => {
          studio.rootAttributes.delete("data-theme");
          studio.backgrounds.set(current, lightFill);
        });
      });
    });
  });
  return studio;
}

verifies("studio-click-test.settings-two-columns-look", () => {
  describe("the Settings two-columns step", () => {
    it("passes on a 34% list and a filled current row in light and Dark, then picks System", async () => {
      const studio = studioWithColumns();
      await expect(settingsTwoColumns.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks.slice(-2)).toEqual([
        settingsText.themeDark.text,
        settingsText.themeSystem.text,
      ]);
      expect(studio.rootAttributes.has("data-theme")).toBe(false);
    });

    it("fails as LIST_COLUMN_WIDTH, naming both widths, when the list isn't 34%", async () => {
      const outcome = await settingsTwoColumns.run(
        studioWithColumns({ listWidth: "160px" }).context,
      );
      expect(outcome).toMatchObject({ passed: false, code: "LIST_COLUMN_WIDTH" });
      expect(outcome.passed ? "" : outcome.note).toContain("160px of 800px");
    });

    it("fails as ROW_FILL, naming both colours, when another row is filled too", async () => {
      const outcome = await settingsTwoColumns.run(
        studioWithColumns({ otherFill: lightFill }).context,
      );
      expect(outcome).toMatchObject({ passed: false, code: "ROW_FILL" });
      expect(outcome.passed ? "" : outcome.note).toContain(
        `${lightFill} and another row ${lightFill}`,
      );
    });

    it("fails as FILL_NOT_THEMED, and still picks System, when Dark keeps light's fill", async () => {
      const studio = studioWithColumns({ darkFill: lightFill });
      const outcome = await settingsTwoColumns.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "FILL_NOT_THEMED" });
      expect(studio.rootAttributes.has("data-theme")).toBe(false);
    });

    it("fails as NO_LIST_COLUMN when the dialog has no Settings sections list", async () => {
      const studio = studioWithColumns();
      button(studio, "main", settingsText.appearance.text);
      const outcome = await settingsTwoColumns.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_LIST_COLUMN" });
    });
  });
});
