import type { Step } from "./runner.ts";
import { closeWorkspace } from "./steps/close-workspace.ts";
import { connectPaperclip } from "./steps/connect-paperclip.ts";
import { demoWorkspace } from "./steps/demo-workspace.ts";
import { engineAnswers } from "./steps/engine-answers.ts";
import { messengerEmpty } from "./steps/messenger-empty.ts";
import { windowTabs } from "./steps/window-tabs.ts";

/**
 * The click test's steps, in the order a person takes them: HAL-17897's phase 1 list, then the
 * Studio basics (HAL-18866), with Close workspace last because it leaves the window on Welcome.
 */
export const clickTestSteps: readonly Step[] = [
  engineAnswers,
  messengerEmpty,
  connectPaperclip,
  demoWorkspace,
  windowTabs,
  closeWorkspace,
];
