import type { Step } from "./runner.ts";
import { addAccount } from "./steps/add-account.ts";
import { closeWorkspace } from "./steps/close-workspace.ts";
import { connectPaperclip } from "./steps/connect-paperclip.ts";
import { accountSwitcher, connectionRow, httpsOnly } from "./steps/connections.ts";
import { demoWorkspace } from "./steps/demo-workspace.ts";
import { engineAnswers } from "./steps/engine-answers.ts";
import { messengerEmpty } from "./steps/messenger-empty.ts";
import { settingsFormats, settingsTheme } from "./steps/settings-display.ts";
import { settingsHostSections } from "./steps/settings-host.ts";
import { windowTabs } from "./steps/window-tabs.ts";

/**
 * The click test's steps, in the order a person takes them: HAL-17897's phase 1 list, then
 * Connections (HAL-18868) straight after Connect Paperclip, then the Studio basics (HAL-18866),
 * with Close workspace last of them because it leaves the window on Welcome, then Settings
 * (HAL-18867), whose steps open the demo again first. Connections comes first because the app
 * restart after a failing step signs step 3's connection out (the agent host keeps its key only
 * in memory), so a failure in between would fail these steps too.
 */
export const clickTestSteps: readonly Step[] = [
  engineAnswers,
  messengerEmpty,
  connectPaperclip,
  accountSwitcher,
  connectionRow,
  httpsOnly,
  addAccount,
  demoWorkspace,
  windowTabs,
  closeWorkspace,
  settingsTheme,
  settingsFormats,
  settingsHostSections,
];
