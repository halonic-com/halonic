import { encodeUtf8, err, ok, type Result } from "@halonicjs/std";
import { findKeyShapedText } from "./key-shaped-text.ts";
import {
  isPlainLine,
  type ServerSessionBlock,
  serverSessionTaskPattern,
} from "./server-session-block.ts";

/** The largest brief, in UTF-8 bytes. The shell refuses a bigger one too. */
export const maxServerSessionBriefBytes = 8 * 1024;

/**
 * Where the requester's Paperclip lives: `https` with a lower-case host and
 * an optional port, or plain `http` on the user's own computer. It comes from
 * the keychain's connection record, never from the request.
 */
const originPattern =
  /^(?:https:\/\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?|http:\/\/(?:localhost|127\.0\.0\.1))(?::[0-9]{1,5})?$/;

/** A requester's name as the provider attests it: one short line. */
function isRequesterName(name: string): boolean {
  return name.length >= 1 && name.length <= 100 && isPlainLine(name);
}

/**
 * Refuses a step or "Done when" that isn't one plain line or holds text
 * shaped like a key. The schema checks the lines too, but a caller may pass
 * a block it never validated, and a new line would add lines of its own to
 * the brief.
 */
function refuseFields(block: ServerSessionBlock): Result<undefined, string> {
  const fields: [string, string][] = [
    ...block.steps.map((step, index): [string, string] => [`step ${index + 1}`, step]),
    ["Done when", block.doneWhen],
  ];
  for (const [name, text] of fields) {
    if (!isPlainLine(text)) return err(`${name} isn't one line of plain text`);
    const shape = findKeyShapedText(text);
    // Name the field and the kind only: the text holds the key.
    if (shape !== undefined) return err(`${name} holds text shaped like a key (${shape})`);
  }
  return ok(undefined);
}

/**
 * Builds the brief Claude Code reads on the user's server for a
 * `server-session` block (plan on HAL-17834, section 2). The text is fixed
 * apart from the task id, the requester, the origin and the requester's own
 * steps and "Done when", and it always starts with `Task: `, so it never
 * starts with `-`.
 *
 * @param requester - who filed it, as the provider attests it, never from the block
 * @param origin - the requester's Paperclip, such as `https://paperclip.acme.example`
 * @returns the brief, or why it can't be sent: a bad task id, origin or
 * requester, a field shaped like a key, or a brief over 8 KB
 *
 * @example
 * const brief = buildServerSessionBrief(block, "Chief", "https://paperclip.acme.example");
 * if (brief.ok) showOnConfirmScreen(brief.value); // "Task: https://paperclip.acme.example/HAL/issues/HAL-1234\n…"
 */
export function buildServerSessionBrief(
  block: ServerSessionBlock,
  requester: string,
  origin: string,
): Result<string, string> {
  if (!serverSessionTaskPattern.test(block.task)) return err("the task id isn't like HAL-1234");
  if (!originPattern.test(origin)) return err("the Paperclip address isn't an https origin");
  if (!isRequesterName(requester)) return err("the requester's name isn't one short line");
  const fields = refuseFields(block);
  if (!fields.ok) return fields;
  const brief = [
    `Task: ${origin}/HAL/issues/${block.task}`,
    `This brief was written by ${requester}, not checked by Halonic.`,
    "Steps:",
    ...block.steps.map((step, index) => `${index + 1}. ${step}`),
    `Done when: ${block.doneWhen}`,
    `When you finish or stop, report back on ${block.task} as server sessions do.`,
    "Never paste a key, token or password into the task.",
    "",
  ].join("\n");
  if (encodeUtf8(brief).length > maxServerSessionBriefBytes) return err("the brief is over 8 KB");
  return ok(brief);
}
