import type { SandboxBackendId, SandboxChoice } from "@halonicjs/app";
import type { StatusChipTone } from "@halonicjs/studio-kit";
import * as text from "./sandbox-choice-text.ts";
import { sandboxChoiceView } from "./sandbox-choice-view.ts";

/** What the status row and badge are made from: the host's answer, or that it is still asking or couldn't answer. */
export type SandboxStatusInput =
  | {
      kind: "answered";
      choice: SandboxChoice;
      /** The operating system, as Node's `process.platform` names it. */
      platform: string;
      /** When the last check passed, already worded for a person ("today at 09:12"), or `null`. */
      lastCheck: string | null;
      /** Whether the "agents ask before running commands" promise is on `main` and tested (O4). */
      agentsAsk: boolean;
    }
  | { kind: "checking" }
  | { kind: "unreachable"; reason: string };

/** An action the row offers; the window only reports which one was pressed. */
export type SandboxStatusAction = "set-up" | "restart" | "check-again" | "change" | "turn-off";

/** The header badge: text always, so the state never rests on colour. */
export interface SandboxBadge {
  label: string;
  tone: StatusChipTone;
  /** The screen-reader name, its visible words first: "Sandbox: on. Opens sandbox settings." */
  name: string;
}

/** The Settings row. */
export interface SandboxStatusRow {
  /** The chip word, from the built Agent sandbox section. */
  state: string;
  /** The chip's colour; the word above always says the state too. */
  tone: StatusChipTone;
  /** The sentence under it, or `null`. */
  line: string | null;
  actions: SandboxStatusAction[];
  /** **Check again** shows busy while a check runs. */
  checkBusy: boolean;
}

/** What the badge and the Settings row show. */
export interface SandboxStatusView {
  /** `null` when no badge shows: no choice yet, nothing proven yet, still checking, or the host can't answer. */
  badge: SandboxBadge | null;
  row: SandboxStatusRow;
}

const badge = (label: string, tone: StatusChipTone): SandboxBadge => ({
  label,
  tone,
  name: text.badgeName(label),
});

/**
 * The header badge and the Settings row from the engine's choice (`settings.sandbox-status-view`).
 * It reads the person's saved setting and the state of that backend and decides nothing: a backend
 * that only has no proof yet (`active: null`, no failure) is Checking and never red. A saved backend
 * that is broken or not set up always keeps a badge, so the choice stays visible.
 *
 * @example
 * sandboxStatusView({ kind: "checking" }).badge; // null
 */
export function sandboxStatusView(input: SandboxStatusInput): SandboxStatusView {
  if (input.kind === "checking") return { badge: null, row: checkingRow() };
  if (input.kind === "unreachable") {
    return {
      badge: null,
      row: row(text.ROW_COULDNT_CHECK, "neutral", text.couldntCheckLine(input.reason), [
        "check-again",
      ]),
    };
  }
  const { choice, lastCheck, agentsAsk } = input;
  const setting = choice.setting;
  if (setting === null) {
    return { badge: null, row: row(text.ROW_NEEDS_SETUP, "attention", null, ["set-up"]) };
  }
  if (setting.backend === "none") {
    return {
      badge: badge(text.BADGE_NONE, "attention"),
      // The line only carries the asking promise; without it the chip already says No sandbox.
      row: row(text.ROW_NO_SANDBOX, "attention", agentsAsk ? text.NO_SANDBOX_ASKS : null, [
        "set-up",
      ]),
    };
  }
  const id: SandboxBackendId = setting.backend;
  const status = choice.backends.find((backend) => backend.id === id);
  const name =
    sandboxChoiceView(choice, input.platform).options.find((card) => card.id === id)?.name ?? id;
  if (status?.state === "in-use") {
    return {
      badge: badge(text.BADGE_ON, "success"),
      row: row(text.ROW_READY, "success", text.readyLine(name, lastCheck), ["change", "turn-off"]),
    };
  }
  if (status?.state === "setup-needed" && status.reason === "restart-needed") {
    return {
      badge: badge(text.BADGE_UNFINISHED, "attention"),
      row: row(text.ROW_RESTART, "attention", text.RESTART_LINE, ["restart", "change"]),
    };
  }
  if (status?.state === "check-failed" || status?.state === "not-available") {
    const line = text.notReadyLine(whyOf(choice, id, input.platform));
    return {
      badge: badge(text.BADGE_CHECK_FAILED, "danger"),
      row: row(text.ROW_NOT_READY, "danger", line, ["check-again", "change"]),
    };
  }
  if (status?.state === "setup-needed") {
    return {
      badge: badge(text.BADGE_UNFINISHED, "attention"),
      row: row(text.ROW_NEEDS_SETUP, "attention", null, ["set-up", "change"]),
    };
  }
  // Saved, and nothing proven either way yet: never red.
  return { badge: null, row: checkingRow() };
}

function row(
  state: string,
  tone: StatusChipTone,
  line: string | null,
  actions: SandboxStatusAction[],
  checkBusy = false,
): SandboxStatusRow {
  return { state, tone, line, actions, checkBusy };
}

/** While the host asks, or a saved backend has no proof yet: a busy **Check again**, never an error. */
function checkingRow(): SandboxStatusRow {
  return row(text.ROW_CHECKING, "neutral", null, ["check-again"], true);
}

/** The card's own sentence for why a backend can't run; the row's line words it after its colon. */
function whyOf(choice: SandboxChoice, id: SandboxBackendId, platform: string): string {
  return (
    sandboxChoiceView(choice, platform).options.find((card) => card.id === id)?.disabledReason ?? ""
  );
}
