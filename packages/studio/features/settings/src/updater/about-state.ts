import { checkedAtLabel } from "../agent-sandbox/sandbox-state.ts";
import * as text from "./about-text.ts";
import { downloadFraction } from "./updater-progress.ts";
import type { UpdateStatus } from "./updater-status.ts";

/** A button the status line can offer. Each starts only on a press. */
export type AboutAction = "download" | "cancel" | "try-again" | "restart";

/** The bar under the downloading line. */
export interface AboutProgress {
  /** The fraction done, or `null` when the server doesn't say how big the download is. */
  readonly fraction: number | null;
  /** The bar's accessible name. */
  readonly name: string;
  /** The value in words, "12 of 48 MB". */
  readonly valueText: string;
}

/** What the section draws under "Halonic 0.1.0" for one status. */
export interface AboutView {
  readonly line: string;
  /** The line is a warning Callout in place of plain text (signature doesn't match). */
  readonly callout: boolean;
  readonly progress: AboutProgress | null;
  readonly actions: readonly AboutAction[];
  /** The address of this update's release notes, when it has one to show beside the line. */
  readonly notesUrl: string | null;
}

const whenOf = (status: UpdateStatus, now: Date): string | null =>
  status.lastChecked === null
    ? null
    : checkedAtLabel(new Date(status.lastChecked).toISOString(), now);

/** Megabytes the way the line says them: "12", or "0.4" while it is small. */
function megabytes(bytes: number): string {
  const value = bytes / 1_000_000;
  return value >= 10 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
}

function progressOf(state: Extract<UpdateStatus["state"], { kind: "downloading" }>): AboutProgress {
  const valueText =
    state.total === null
      ? `${megabytes(state.done)} MB`
      : `${megabytes(state.done)} of ${megabytes(state.total)} MB`;
  return {
    fraction: downloadFraction(state),
    name: text.downloadingName(state.version),
    valueText,
  };
}

/**
 * Words and buttons for each state of `settings.about-section`. A check that can't finish is a
 * calm muted line with its reason; nothing here shows raw error text. When another tool manages
 * updates, Studio downloads and installs nothing, so no state offers a button.
 */
export function aboutView(status: UpdateStatus, now: Date): AboutView {
  const { state } = status;
  const when = whenOf(status, now);
  const buttons = (...actions: AboutAction[]): readonly AboutAction[] =>
    status.managed === null ? actions : [];
  const view = (line: string, rest: Partial<AboutView> = {}): AboutView => ({
    line,
    callout: false,
    progress: null,
    actions: [],
    notesUrl: null,
    ...rest,
  });
  switch (state.kind) {
    case "never-checked":
      return view(text.NOT_CHECKED);
    case "up-to-date":
      if (!status.automatic) return view(text.automaticOff(when));
      return view(when === null ? "Up to date." : text.upToDate(when));
    case "cant-check":
      return view(text.cantCheck(text.checkReasons[state.reason], when));
    case "available":
      return view(text.available(state.version, status.current), {
        actions: buttons("download"),
        notesUrl: state.notesUrl,
      });
    case "downloading":
      return view(text.downloading(state.version, progressOf(state).valueText), {
        progress: progressOf(state),
        actions: buttons("cancel"),
      });
    case "download-failed":
      return view(text.downloadFailed(state.version, text.downloadReasons[state.reason]), {
        actions: buttons("try-again"),
      });
    case "signature-mismatch":
      return view(text.signatureMismatch(state.version, status.current), { callout: true });
    case "ready":
      return view(text.ready(state.version), {
        actions: buttons("restart"),
        notesUrl: state.notesUrl,
      });
    case "did-not-install":
      return view(text.didNotInstall(state.version, status.current), {
        actions: buttons("try-again"),
      });
  }
}

/** What the announcer says after Check now, or `null` when the check found nothing to say. */
export function checkAnnouncement(status: UpdateStatus, now: Date): string | null {
  const { state } = status;
  if (state.kind === "up-to-date") {
    const when = whenOf(status, now);
    return when === null ? null : text.announceUpToDate(status.current, when);
  }
  if (state.kind === "cant-check") return text.announceCantCheck(text.checkReasons[state.reason]);
  if (state.kind === "available") return text.announceAvailable(state.version);
  return null;
}
