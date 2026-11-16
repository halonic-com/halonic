import type { EngineStartFailureReason } from "./engine-start.ts";

/** The words of the window shown when the engine didn't start (microcopy 22 F1, F1b and F18). */
export const engineFailedWords = {
  title: "Halonic's engine didn't start",
  reasons: {
    "stopped-while-starting": "It stopped while starting.",
    "no-answer": "It didn't answer within 30 seconds.",
    "data-folder-not-writable": "Halonic can't write to its data folder.",
  } satisfies Record<EngineStartFailureReason, string>,
  reassurance: "Your workspaces are folders of plain files, and nothing in them changed.",
  tryAgain: "Try again",
  /** F1b: only on the first start after an update. */
  justUpdated: (newVersion: string, oldVersion: string) =>
    `Halonic was just updated to ${newVersion}. If this keeps happening, uninstall Halonic, then install ${oldVersion} again from the release page. Your workspaces and settings stay.`,
  openReleasePage: "Open release page",
  /** F18: read once, assertively, when the window shows. */
  announcement: (reason: string) => `Halonic's engine didn't start. ${reason}`,
} as const;
