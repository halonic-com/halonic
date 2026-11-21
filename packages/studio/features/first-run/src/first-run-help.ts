import type { HelpItem, ItemRef } from "@halonicjs/studio-shell";
import { type FirstRun, SUPPORT_WORKFLOW } from "./first-run.ts";
import { helpWords } from "./first-run-words.ts";

/** Support reply's page, where the guide card is. */
const supportReply: ItemRef = { kind: "workflow", hub: "support", id: SUPPORT_WORKFLOW };

/**
 * The first run's items in **Help › First run** (`first-run.help`), only in the demo: **Show the
 * guide again**, which takes the first run up again (or begins it again at Demo) and opens Support
 * reply, and **Start over** where the app can copy the demo again, each with a line that says what
 * it does. In someone's own workspace "Your old copy" would have nothing to refer to, so neither
 * shows there. Both show whatever the state, so the menu never offers a stale choice: showing the
 * guide while it is on only opens the page.
 */
export function firstRunHelpItems(
  firstRun: FirstRun,
  openItem: ((item: ItemRef) => void) | undefined,
): readonly HelpItem[] {
  if (!firstRun.isDemo) return [];
  const items: HelpItem[] = [
    {
      id: "show-guide",
      label: helpWords.showGuide,
      description: helpWords.showGuideAbout,
      run: () => {
        firstRun.showGuide();
        openItem?.(supportReply);
      },
    },
  ];
  if (firstRun.canStartOver) {
    items.push({
      id: "start-over",
      label: helpWords.startOver,
      description: helpWords.startOverAbout,
      run: () => firstRun.startOver(),
    });
  }
  return items;
}
