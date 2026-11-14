/**
 * What was read from stdin but not used yet, and whether stdin has ended.
 * The line reader and the secret reader of one terminal share it, so text
 * typed or pasted ahead reaches whichever asks next, in order.
 */
export class TypeAhead {
  text = "";
  ended = false;
}
