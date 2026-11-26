import type { Step } from "./runner.ts";
import { addAccount } from "./steps/add-account.ts";
import { closeWorkspace } from "./steps/close-workspace.ts";
import { connectPaperclip } from "./steps/connect-paperclip.ts";
import { accountSwitcher, connectionRow, httpsOnly } from "./steps/connections.ts";
import { demoWorkspace } from "./steps/demo-workspace.ts";
import { engineAnswers } from "./steps/engine-answers.ts";
import { inboxAnswer } from "./steps/inbox-answer.ts";
import { messengerEmpty } from "./steps/messenger-empty.ts";
import { messengerSend } from "./steps/messenger-send.ts";
import { overviewRecap, searchTask } from "./steps/search-overview.ts";
import { settingsFormats, settingsTheme } from "./steps/settings-display.ts";
import { settingsHostSections } from "./steps/settings-host.ts";
import { disconnect, startMenuShortcuts } from "./steps/shortcuts-disconnect.ts";
import { windowTabs } from "./steps/window-tabs.ts";

/**
 * The click test's steps, in the order a person takes them: HAL-17897's phase 1 list up to
 * Connect Paperclip, then Connections (HAL-18868) and the rest of the phase 1 list on the
 * connected Paperclip (HAL-18354), with Disconnect last of them, then the Studio basics
 * (HAL-18866), with Close workspace last of them because it leaves the window on Welcome, then
 * Settings (HAL-18867), whose steps open the demo again first. The Paperclip steps come straight
 * after Connect Paperclip because a restart after a failing step signed step 3's connection out
 * (runs 45722257989 to 45730163649, HAL-19027), so a failure in between would fail them too.
 */
export const clickTestSteps: readonly Step[] = [
  engineAnswers,
  messengerEmpty,
  connectPaperclip,
  accountSwitcher,
  connectionRow,
  httpsOnly,
  addAccount,
  inboxAnswer,
  messengerSend,
  searchTask,
  overviewRecap,
  startMenuShortcuts,
  disconnect,
  demoWorkspace,
  windowTabs,
  closeWorkspace,
  settingsTheme,
  settingsFormats,
  settingsHostSections,
];
