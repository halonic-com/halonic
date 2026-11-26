import type { Step } from "../runner.ts";
import { clickRow, lastWords, waitForText } from "../screen.ts";
import { seedNames } from "../test-paperclip.ts";
import { keys } from "../webdriver.ts";
import { screenText } from "../words.ts";
import { closeDialogs, onWorkspace, openPlace } from "./open-demo.ts";

/**
 * Step 11: search finds the seeded task. Ctrl+K opens the search box, as the
 * sidebar's Search button says; the step types the task's title and opens
 * the result.
 */
export const searchTask: Step = {
  id: "search-task",
  title: "Search finds the seeded task",
  requirements: ["studio.desktop-search-overview", "search.palette"],
  needs: ["connect-paperclip"],
  run: async (context) => {
    const workspace = await onWorkspace(context);
    if (!workspace.passed) return workspace;
    await closeDialogs(context);
    await context.driver.pressKeys([keys.control, "k"]);
    const box = `//input[@aria-label='${screenText.search.text}']`;
    const typed = await context.driver.type(box, seedNames.task).then(
      () => true,
      () => false,
    );
    if (!typed) return { passed: false, code: "NO_SEARCH_BOX", note: `No box ${box}.` };
    if (await clickRow(context, seedNames.task, 30_000)) return { passed: true };
    const { text } = await waitForText(context, 0, () => undefined);
    return { passed: false, code: "NOT_FOUND", note: lastWords(text) };
  },
};

/** Step 12: the overview and the recap show, with their headings. */
export const overviewRecap: Step = {
  id: "overview-recap",
  title: "Overview and recap show",
  requirements: ["studio.desktop-search-overview", "overview.place"],
  needs: ["connect-paperclip"],
  run: async (context) => {
    const workspace = await onWorkspace(context);
    if (!workspace.passed) return workspace;
    await closeDialogs(context);
    if (!(await openPlace(context, screenText.overview.text))) {
      const { text } = await waitForText(context, 0, () => undefined);
      return { passed: false, code: "NO_OVERVIEW", note: lastWords(text) };
    }
    const { recap, nothingBlocked } = screenText;
    const shown = await waitForText(context, 30_000, (text) =>
      text.includes(recap.text) && text.includes(nothingBlocked.text) ? true : undefined,
    );
    if (shown.value === true) return { passed: true };
    return { passed: false, code: "NO_RECAP", note: lastWords(shown.text) };
  },
};
