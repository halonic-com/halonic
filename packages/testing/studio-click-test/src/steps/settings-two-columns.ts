import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { settingsText } from "../words.ts";
import { failure, openSection, pickTheme } from "./settings-display.ts";

/** The Settings dialog's list column, by the name the app gives it. */
export const settingsListColumn = `//nav[@aria-label='${settingsText.sectionsList.text}']`;

/** The parts of the dialog the step reads, as XPaths. */
export const settingsColumnParts = {
  list: settingsListColumn,
  // The list column's 34% is of the row that holds it and the content pane, not of the dialog's
  // frame, so the step measures that row.
  holder: `${settingsListColumn}/..`,
  current: `${settingsListColumn}//button[@aria-current='page']`,
  // Appearance is current and under the pointer after its click, so any other row is neither.
  other: `(${settingsListColumn}//button[not(@aria-current)])[1]`,
} as const;

/** What the browser reports as the background of an element with none. */
const noFill = "rgba(0, 0, 0, 0)";

/**
 * Settings' two columns (`shell.settings-two-columns`), light and then Dark: the list column is
 * 34% of the dialog's row, between 208px and 380px, and only the current section's row has a
 * fill. Dark's fill must differ from light's, so the row follows the theme's token. It picks
 * System again at the end, so the steps after it see the window as a person's first start does.
 */
export const settingsTwoColumns: Step = {
  id: "settings-two-columns",
  title: "Settings, the list column's width and the current row's fill, light and Dark",
  requirements: ["shell.settings-two-columns"],
  run: async (context) => {
    const opened = await openSection(context, settingsText.appearance.text);
    if (!opened.passed) return opened;
    const width = await listColumnWidth(context);
    if (!width.passed) return width;
    const light = await rowFills(context, "light");
    if (!light.passed) return light;
    const dark = await pickTheme(context, settingsText.themeDark.text, "dark");
    if (!dark.passed) return dark;
    const darkFills = await rowFills(context, "Dark");
    const system = await pickTheme(context, settingsText.themeSystem.text, null);
    if (!darkFills.passed) return darkFills;
    if (darkFills.fill === light.fill) {
      const said = `The current row is ${light.fill} in light and in Dark.`;
      return { passed: false, code: "FILL_NOT_THEMED", note: said };
    }
    return system;
  },
};

/** Fails unless the list column is 34% of its row, kept between 208px and 380px. */
async function listColumnWidth(context: StepContext): Promise<StepOutcome> {
  if ((await context.driver.count(settingsColumnParts.list)) === 0) {
    return failure("NO_LIST_COLUMN", "", `No list named ${settingsText.sectionsList.text}.`);
  }
  const list = Number.parseFloat(await context.driver.cssValue(settingsColumnParts.list, "width"));
  const holder = Number.parseFloat(
    await context.driver.cssValue(settingsColumnParts.holder, "width"),
  );
  const expected = Math.min(Math.max(holder * 0.34, 208), 380);
  // A browser rounds a column's width to its pixel grid, so a pixel either way is still right.
  if (Math.abs(list - expected) <= 1) return { passed: true };
  const said = `The list column is ${list}px of ${holder}px, not ${expected.toFixed(1)}px.`;
  return { passed: false, code: "LIST_COLUMN_WIDTH", note: said };
}

/** Reads the current row's fill and another row's, and fails unless only the current one has one. */
async function rowFills(
  context: StepContext,
  theme: string,
): Promise<StepOutcome & { readonly fill?: string }> {
  const { current, other } = settingsColumnParts;
  if ((await context.driver.count(current)) === 0 || (await context.driver.count(other)) === 0) {
    return failure("NO_SECTION_ROWS", "", "No current row and other row in Settings' list.");
  }
  const fill = await context.driver.cssValue(current, "background-color");
  const otherFill = await context.driver.cssValue(other, "background-color");
  if (fill !== noFill && otherFill === noFill) return { passed: true, fill };
  const said = `In ${theme}, the current row is ${fill} and another row ${otherFill}.`;
  return { passed: false, code: "ROW_FILL", note: said };
}
