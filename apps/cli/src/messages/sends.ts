import type { RunSends, SendGroup } from "@halonicjs/events";
import { counted, listInWords } from "./counts.ts";

/**
 * What a run sent, as the parts of its receipt and its ✓ Done row in
 * `halonic runs` say it (cli-output 3.4, "What it sent", revision 38): one
 * part per verb in call order, then a "may have" part per verb for the calls
 * that broke off, so a possible send is never hidden. "sent nothing" only for
 * a run without a tool call; a run whose tool calls sent nothing has no part.
 * Lower case, since the line gives its first part the capital.
 *
 * The nouns come from integration sheets, whose format allows only letters
 * and spaces, so they need no escaping.
 *
 * @param sends - what `sendsOf` in `@halonicjs/events` read from the run's log
 * @returns the parts, in the order the line shows them; empty when there's nothing to say
 *
 * @example
 * sendsInWords(sendsOf(events));
 * // ["sent 2 emails and 2 invites", "saved 1 Drive file", "may have moved 1 Drive file"]
 */
export function sendsInWords(sends: RunSends): string[] {
  if (!sends.madeToolCalls) {
    return ["sent nothing"];
  }
  return [
    ...sends.sent.map(groupInWords),
    ...sends.maySend.map((group) => `may have ${groupInWords(group)}`),
  ];
}

/** One verb's phrase: "sent 1 email, 2 invites and 1 cancellation". */
function groupInWords(group: SendGroup): string {
  const counts = group.counts.map(({ calls, noun }) => counted(calls, noun.one, noun.many));
  return `${group.verb} ${listInWords(counts)}`;
}
