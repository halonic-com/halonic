import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { lastWords, optionNamed, pickWhenShown, pollEveryMs, waitForText } from "../screen.ts";
import { settingsText } from "../words.ts";
import { onWorkspace, openSettingsSection } from "./open-demo.ts";

/** How long a pick may take to show on the window. */
const appliedWaitMs = 10_000;

/**
 * Settings › Appearance: Theme Dark sets the window's theme at once, and
 * System, the default, takes it off again, so the steps after it see the
 * window as a person's first start does.
 */
export const settingsTheme: Step = {
  id: "settings-theme",
  title: "Settings › Appearance, Theme Dark, then System again",
  requirements: ["settings.feature", "settings.appearance-section", "settings.appearance-theme"],
  run: async (context) => {
    const opened = await openSection(context, settingsText.appearance.text);
    if (!opened.passed) return opened;
    const dark = await pickTheme(context, settingsText.themeDark.text, "dark");
    if (!dark.passed) return dark;
    return pickTheme(context, settingsText.themeSystem.text, null);
  },
};

/**
 * Settings › Formats: the example under Format changes as soon as Dutch
 * (Netherlands) is picked, then the format follows the computer again.
 */
export const settingsFormats: Step = {
  id: "settings-formats",
  title: "Settings › Formats, Dutch (Netherlands) changes the example",
  requirements: ["settings.formats-section", "settings.formats-format"],
  run: async (context) => {
    const opened = await openSection(context, settingsText.formats.text);
    if (!opened.passed) return opened;
    const { formatExample, dutch, dutchNumber, followComputer } = settingsText;
    const shown = await waitForText(context, appliedWaitMs, (text) =>
      text.includes(formatExample.text) ? true : undefined,
    );
    if (shown.value === undefined) return failure("NO_FORMAT_EXAMPLE", shown.text);
    if (!(await pickWhenShown(context, optionNamed(dutch.text), appliedWaitMs))) {
      return failure("NO_FORMAT_CHOICE", shown.text);
    }
    const dutchExample = `${formatExample.text} ${dutchNumber.text}`;
    const changed = await waitForText(context, appliedWaitMs, (text) =>
      text.includes(dutchExample) ? true : undefined,
    );
    if (changed.value === undefined) return failure("EXAMPLE_UNCHANGED", changed.text);
    if (!(await pickWhenShown(context, optionNamed(followComputer.text, true), appliedWaitMs))) {
      return failure("NO_FORMAT_CHOICE", changed.text);
    }
    const back = await waitForText(context, appliedWaitMs, (text) =>
      text.includes(dutchExample) ? undefined : true,
    );
    if (back.value === undefined) return failure("EXAMPLE_UNCHANGED", back.text);
    return { passed: true };
  },
};

/** Puts the main window on a workspace and opens a Settings section by its row. */
export async function openSection(context: StepContext, row: string): Promise<StepOutcome> {
  const workspace = await onWorkspace(context);
  if (!workspace.passed) return workspace;
  if (await openSettingsSection(context, row)) return { passed: true };
  const { text } = await waitForText(context, 0, () => undefined);
  return failure("NO_SETTINGS", text, `No ${row} row in Settings.`);
}

/** Picks a Theme option, then waits for the window's `data-theme` to read `theme`. */
export async function pickTheme(
  context: StepContext,
  option: string,
  theme: string | null,
): Promise<StepOutcome> {
  if (!(await pickWhenShown(context, optionNamed(option), appliedWaitMs))) {
    const { text } = await waitForText(context, 0, () => undefined);
    return failure("NO_THEME_CHOICE", text, `No ${option} in Theme.`);
  }
  let seen: string | null = null;
  for (let read = 0; read < appliedWaitMs / pollEveryMs; read += 1) {
    seen = await context.driver.attribute("/html", "data-theme");
    if (seen === theme) return { passed: true };
    await context.sleep(pollEveryMs);
  }
  const { text } = await waitForText(context, 0, () => undefined);
  const said = `Picked ${option}; the window's data-theme is ${seen ?? "unset"}.`;
  return failure("THEME_NOT_APPLIED", text, said);
}

/** A failed outcome with what the screen showed last, after the step's own words. */
export function failure(code: string, text: string, said = ""): StepOutcome {
  const seen = text === "" ? "" : `Screen: ${lastWords(text)}`;
  return { passed: false, code, note: [said, seen].filter((part) => part !== "").join(" ") };
}
