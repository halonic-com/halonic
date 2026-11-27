import { type PlacePage, placePages, type TextInFile } from "../place-words.ts";
import type { Step, StepContext } from "../runner.ts";
import { clickWhenShown, lastWords, waitForText } from "../screen.ts";
import { screenText } from "../words.ts";
import { onWorkspaceWithoutSettings } from "./open-demo.ts";
import { inWideWindow } from "./wide-window.ts";

/** How long a place's page may take to load its first list. */
const pageWaitMs = 30_000;

/** Why one place's page didn't show. */
interface PlaceFailure {
  readonly code: string;
  readonly note: string;
}

/**
 * Step 22 (HAL-18870): the demo's other places open. From the Places list it
 * opens Inbox, Runs, Library and Changes in turn, and each page must show its
 * own text. It checks every place even after one fails, so one run names them
 * all, and reports the first failure's code.
 */
export const placesOpen: Step = {
  id: "places-open",
  title: "Inbox, Runs, Library and Changes open from Places",
  requirements: [
    "shell.sidebar-places",
    "inbox.page",
    "inbox.request",
    "runs.app-list",
    "runs.list-column",
    "library.library-place",
    "library.library-page",
    "source-control.changes-page",
  ],
  run: async (context) => {
    // An earlier step can leave the Settings dialog over the Places list.
    const workspace = await onWorkspaceWithoutSettings(context);
    if (!workspace.passed) return workspace;
    const failures: PlaceFailure[] = [];
    for (const page of placePages) {
      const failure = await checkPlace(context, page);
      if (failure !== undefined) failures.push(failure);
    }
    const [first] = failures;
    if (first === undefined) return { passed: true };
    return { passed: false, code: first.code, note: failures.map((f) => f.note).join("\n") };
  },
};

async function checkPlace(
  context: StepContext,
  page: PlacePage,
): Promise<PlaceFailure | undefined> {
  const name = page.place.text;
  const noPage = `NO_${name.toUpperCase()}_PAGE`;
  if (!(await openPlace(context, name))) {
    return { code: noPage, note: `${name}: not in the Places list.` };
  }
  const shown = await waitForText(context, pageWaitMs, (text) => {
    if (page.failed !== undefined && text.includes(page.failed.text)) return page.failed.code;
    return page.shows.some((line) => text.includes(line.text)) ? "shown" : undefined;
  });
  if (shown.value !== "shown") {
    return { code: shown.value ?? noPage, note: `${name}: ${lastWords(shown.text)}` };
  }
  return page.wide === undefined ? undefined : checkWide(context, name, page.wide);
}

/**
 * Widens the window and waits for the page's `wide` text, such as the Runs page's empty content
 * pane beside its list (`runs.list-column`); fails as `NO_<PLACE>_WIDE_PAGE` without it.
 */
async function checkWide(
  context: StepContext,
  name: string,
  wide: TextInFile,
): Promise<PlaceFailure | undefined> {
  const outcome = await inWideWindow(context, async () => {
    const shown = await waitForText(context, pageWaitMs, (text) =>
      text.includes(wide.text) ? "shown" : undefined,
    );
    if (shown.value === "shown") return { passed: true };
    const note = `${name}, in a wide window: ${lastWords(shown.text)}`;
    return { passed: false, code: `NO_${name.toUpperCase()}_WIDE_PAGE`, note };
  });
  return outcome.passed ? undefined : { code: outcome.code, note: outcome.note };
}

/**
 * Clicks the place in the Places list, opening the list first unless it is
 * open already, as `openConnections` does for Settings.
 */
async function openPlace(context: StepContext, name: string): Promise<boolean> {
  if (await clickWhenShown(context, name, 2_000)) return true;
  return (
    (await clickWhenShown(context, screenText.places.text, 10_000)) &&
    (await clickWhenShown(context, name, 10_000))
  );
}
