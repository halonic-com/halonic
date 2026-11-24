import { type Infer, s } from "@halonicjs/schema-kit";

/**
 * A Paperclip task id. Deliberately stricter than `^HAL-[0-9]+$`: at most 7
 * digits, so the id that names the brief's file on the server stays short
 * (plan on HAL-17834, section 1).
 */
export const serverSessionTaskPattern = /^HAL-[0-9]{1,7}$/;

/** The most steps a `server-session` block may list, and the longest step. */
export const maxServerSessionSteps = 20;
export const maxServerSessionStepLength = 300;

/** The longest "Done when" a `server-session` block may carry. */
export const maxServerSessionDoneWhenLength = 500;

/**
 * Whether `text` is one line of plain text: no control character, so a step
 * can't add a line of its own to the brief.
 */
export function isPlainLine(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

const plainText = (max: number) =>
  s.string().min(1).max(max).refine(isPlainLine, "must be one line of plain text");

/**
 * A request to open Claude Code on the user's own server for one task, with
 * the requester's steps and "Done when" as its brief. It is a block of a
 * `halonic.stepper-request/1` document, but not of `stepperBlockSchema`, so
 * a ToolScript header can never carry one, and it must be the request's only
 * block (plan on HAL-17834, section 1).
 */
export const serverSessionBlockSchema = s
  .object({
    kind: s.literal("server-session"),
    task: s.string().regex(serverSessionTaskPattern, "must be a task id such as HAL-1234"),
    steps: s.array(plainText(maxServerSessionStepLength)).min(1).max(maxServerSessionSteps),
    doneWhen: plainText(maxServerSessionDoneWhenLength),
  })
  .strict();

/** A `server-session` block: the task, its steps and its "Done when". */
export type ServerSessionBlock = Infer<typeof serverSessionBlockSchema>;
