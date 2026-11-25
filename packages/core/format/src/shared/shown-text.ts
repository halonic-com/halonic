// Text from a file that a person or an agent reads: a plugin's name and
// labels, a workspace tool's description. Shared so every kind refuses the
// same hidden marks.
import { s } from "@halonicjs/schema-kit";

/**
 * A character a person can't see: a control character (\p{Cc}), a format
 * character (\p{Cf}: zero-width spaces and joiners, the byte-order mark,
 * text-direction marks and the tag characters U+E0000–E007F), a line or
 * paragraph separator (U+2028, U+2029), or a mark that turns the direction
 * of the text around it. In text a person reads, any of them can make one
 * name look like another, in the Plugins list and in the trust dialog, or
 * hide instructions an agent reads and a person doesn't. A line break is
 * the one exception, and only in longer text.
 */
export const HIDDEN_MARK = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Bidi_Control}]/u;
const HIDDEN_MARK_BUT_LINE_BREAK = /(?!\n)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Bidi_Control}]/u;
export const NO_HIDDEN_MARKS = "don't use control, invisible or text-direction characters";

/** Whether a description or help text has no hidden mark. It may break lines. */
export const withoutHiddenMarks = (text: string) => !HIDDEN_MARK_BUT_LINE_BREAK.test(text);

/** Text a person reads: a title or a label. Studio shows it as untrusted text. */
export const label = s
  .string()
  .min(1)
  .max(80)
  .refine((text) => !HIDDEN_MARK.test(text), NO_HIDDEN_MARKS);
