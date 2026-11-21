import type { HelpItem, ItemRef } from "@halonicjs/studio-shell";
import { type FirstRun, SUPPORT_WORKFLOW } from "./first-run.ts";
import { helpWords } from "./first-run-words.ts";

/** Support reply's page, where the guide card is. */
const supportReply: ItemRef = { kind: "workflow", hub: "support", id: SUPPORT_WORKFLOW };

/**
 * The first run's items in **Help › First run** (`first-run.help`): **Show the guide** in the
 * demo, which takes the first run up again (or begins it again at Demo) and opens Support reply,
 * and **Start over** where the app can copy the demo again. Both show whatever the state, so the
 * menu never offers a stale choice: showing the guide while it is on only opens the page.
 */
export function firstRunHelpItems(
  firstRun: FirstRun,
  openItem: ((item: ItemRef) => void) | undefined,
): readonly HelpItem[] {
  const items: HelpItem[] = [];
  if (firstRun.isDemo) {
    items.push({
      id: "show-guide",
      label: helpWords.showGuide,
      run: () => {
        firstRun.showGuide();
        openItem?.(supportReply);
      },
    });
  }
  if (firstRun.canStartOver) {
    items.push({ id: "start-over", label: helpWords.startOver, run: () => firstRun.startOver() });
  }
  return items;
}
