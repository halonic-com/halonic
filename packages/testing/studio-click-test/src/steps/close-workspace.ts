import type { Step } from "../runner.ts";
import { clickWhenShown, lastWords, missingParts, waitForText } from "../screen.ts";
import { basicsText, buttonLabels } from "../words.ts";
import { openWorkspaceMenu } from "./demo-workspace.ts";
import { onWorkspaceWithoutSettings } from "./open-demo.ts";

/**
 * Step 6: the workspace menu's Close workspace closes the demo, the only open workspace, so the
 * window shows Welcome again, now with the demo's folder under Recent with the Demo tag, and Open
 * demo still offered. A later step that needs a workspace opens the demo again from there.
 */
export const closeWorkspace: Step = {
  id: "close-workspace",
  title: "Close workspace shows Welcome, with the demo under Recent",
  requirements: [
    "workspace.workspace-window",
    "shell.welcome-open",
    "shell.welcome-recent",
    "shell.welcome-sample",
  ],
  run: async (context) => {
    const workspace = await onWorkspaceWithoutSettings(context);
    if (!workspace.passed) return workspace;
    const menu = await openWorkspaceMenu(context);
    if (!menu.passed) return menu;
    if (!(await clickWhenShown(context, buttonLabels.closeWorkspace.text, 10_000))) {
      return { passed: false, code: "NO_CLOSE_WORKSPACE", note: "No Close workspace row." };
    }
    const { welcomeTitle, welcomeLine, recent, demoFolder, demoTag } = basicsText;
    const wanted = [
      welcomeTitle.text,
      welcomeLine.text,
      recent.text,
      demoFolder.text,
      demoTag.text,
      buttonLabels.openDemo.text,
    ];
    const welcome = await waitForText(context, 20_000, (text) =>
      wanted.every((part) => text.includes(part)) ? true : undefined,
    );
    if (welcome.value === true) return { passed: true };
    const missing = missingParts(wanted, welcome.text);
    const note = `Welcome has no ${missing}. Screen: ${lastWords(welcome.text)}`;
    return { passed: false, code: "NO_WELCOME", note };
  },
};
