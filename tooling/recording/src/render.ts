import type { Cast } from "./asciicast.ts";
import { paceCast } from "./pace.ts";
import type { Recording } from "./recording.ts";
import { drawAnimated, drawStill, type StepLabel } from "./svg.ts";
import type { Tape } from "./tape.ts";
import { playCast } from "./terminal.ts";
import { titleWithVersion } from "./version.ts";

/** What rendering a capture gives: the paced cast and the two drawings. */
export interface RenderedRecording {
  /** The capture paced for reading, still asciicast v2. */
  readonly paced: Cast;
  /** Plays once, then rests on the last frame. */
  readonly animated: string;
  /** Only the last frame: what the README shows until someone clicks it. */
  readonly still: string;
}

/** What to render: the real capture, what its `halonic --version` printed, and the recording file. */
export interface RenderInput {
  readonly capture: Cast;
  /** The `<name>.version` the capture saved; `undefined` when there is none. */
  readonly versionOutput: string | undefined;
  readonly recording: Recording;
}

/**
 * Paces the capture, replays it through the small terminal and draws it.
 * The window bar's version comes only from what the captured
 * `halonic --version` printed, so a recording can't show a version it
 * didn't run.
 */
export function renderRecording(input: RenderInput): RenderedRecording {
  if (input.versionOutput === undefined) {
    throw new Error(
      "There is no saved version next to the cast. Capture again: the version in the window bar comes from the captured `halonic --version`.",
    );
  }
  const title = titleWithVersion(input.recording.title, input.versionOutput);
  const paced = paceCast(input.capture, input.recording);
  const tape = playCast(paced);
  const window = { title, alt: input.recording.alt, steps: stepsOf(tape, input.recording) };
  return { paced, animated: drawAnimated(tape, window), still: drawStill(tape, window) };
}

/** Each command with a step label lights it up from the moment the command is typed. */
function stepsOf(tape: Tape, recording: Recording): StepLabel[] {
  return recording.commands.flatMap((command, index) => {
    const marker = tape.commands[index];
    return command.step === undefined || marker === undefined
      ? []
      : [{ label: command.step, time: marker.time }];
  });
}
