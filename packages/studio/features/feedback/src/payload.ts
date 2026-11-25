import { feedbackWords } from "./feedback-words.ts";

/** The longest task title, in characters, the "…" included. */
export const maxTitleLength = 80;

/** What the person wrote and what Studio knows about the moment they wrote it. */
export interface FeedbackInput {
  /** The text field, as typed. Its first line becomes the task's title. */
  readonly text: string;
  /** The app the selected area belongs to, such as "Halonic Studio". */
  readonly app: string;
  /** That app's window title, such as "Runs". */
  readonly window: string;
  /** When the shortcut was pressed. */
  readonly capturedAt: Date;
  /** The computer's offset from UTC at that moment, in minutes east of UTC (60 in Madrid in winter). */
  readonly utcOffsetMinutes: number;
  /** The Studio version, such as "0.2.0". */
  readonly studioVersion: string;
  /** The selected area's size in device pixels, or `null` when sent without a screenshot. */
  readonly screenshot: { readonly width: number; readonly height: number } | null;
  /** Where the task goes and who gets it (Settings → Feedback). */
  readonly project: string;
  readonly assignee: string;
}

/** The screenshot file attached to the task. */
export interface FeedbackScreenshot {
  readonly fileName: string;
  readonly contentType: "image/png";
  readonly width: number;
  readonly height: number;
}

/** One feedback, ready to become a Paperclip task. */
export interface FeedbackTask {
  readonly title: string;
  readonly description: string;
  readonly project: string;
  readonly assignee: string;
  readonly screenshot: FeedbackScreenshot | null;
}

/** A task to create, or the reason the modal stays open. */
export type FeedbackBuild =
  | { readonly kind: "task"; readonly task: FeedbackTask }
  | { readonly kind: "empty-text"; readonly message: string };

/**
 * Turns what the person typed into the task Studio creates. Empty text makes
 * no task: a task needs a title, so the modal stays open and says why.
 */
export function buildFeedbackTask(input: FeedbackInput): FeedbackBuild {
  const title = feedbackTitle(input.text);
  if (title === "") {
    return { kind: "empty-text", message: feedbackWords.emptyText };
  }
  const time = isoWithOffset(input.capturedAt, input.utcOffsetMinutes);
  const screenshot =
    input.screenshot === null
      ? null
      : {
          fileName: `feedback-${time.slice(0, 19).replaceAll(":", "-")}.png`,
          contentType: "image/png" as const,
          width: input.screenshot.width,
          height: input.screenshot.height,
        };
  return {
    kind: "task",
    task: {
      title,
      description: feedbackDescription(input, time),
      project: input.project,
      assignee: input.assignee,
      screenshot,
    },
  };
}

/**
 * The task's title: the first line with any text, trimmed, cut to
 * {@link maxTitleLength} characters with "…" at the end when it is longer.
 * Counts characters, not UTF-16 units, so an emoji is never cut in half.
 */
export function feedbackTitle(text: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== "");
  if (firstLine === undefined) {
    return "";
  }
  const characters = Array.from(firstLine);
  if (characters.length <= maxTitleLength) {
    return firstLine;
  }
  return `${characters
    .slice(0, maxTitleLength - 1)
    .join("")
    .trimEnd()}…`;
}

/** A time as ISO 8601 with the computer's offset, such as "2026-11-25T18:04:05+01:00". */
export function isoWithOffset(time: Date, utcOffsetMinutes: number): string {
  const local = new Date(time.getTime() + utcOffsetMinutes * 60_000);
  const sign = utcOffsetMinutes < 0 ? "-" : "+";
  const offset = Math.abs(utcOffsetMinutes);
  const hours = String(Math.floor(offset / 60)).padStart(2, "0");
  const minutes = String(offset % 60).padStart(2, "0");
  return `${local.toISOString().slice(0, 19)}${sign}${hours}:${minutes}`;
}

function feedbackDescription(input: FeedbackInput, time: string): string {
  const details = [
    `- App: ${codeSpan(input.app)}`,
    `- Window: ${codeSpan(input.window)}`,
    `- Time: ${time}`,
    `- Studio version: ${codeSpan(input.studioVersion)}`,
    input.screenshot === null
      ? "- Screenshot: none"
      : `- Screenshot: ${input.screenshot.width} × ${input.screenshot.height} px, attached`,
  ];
  return [
    input.text.trim(),
    "",
    "---",
    "",
    "Sent from Studio's feedback shortcut.",
    "",
    ...details,
  ].join("\n");
}

/**
 * Window and app names come from other apps, so they go in a code span:
 * Markdown in a window title (a link, a heading) stays plain text.
 */
function codeSpan(value: string): string {
  const oneLine = value.replaceAll(/[\s`]+/g, " ").trim();
  return oneLine === "" ? "(none)" : `\`${oneLine}\``;
}
