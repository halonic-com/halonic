import { isAllowedWebLink } from "@halonicjs/ports";

/** A run of a message's text, or a link the phone may open. */
export type MessagePart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "link"; readonly link: string };

/** A Markdown link `[label](address)`, or an address on its own. */
const linkPattern = /\[([^\]\n]*)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+)/g;

/**
 * Splits an agent's message for the phone (requirement `remote.phone-messenger`). A link the
 * phone may open is a link part that shows its full address, never a label that could say
 * something else; a Markdown link keeps its label as text before it. A link `isAllowedWebLink`
 * refuses stays plain text, so there's nothing to tap. `connectionOrigin` is the Paperclip origin
 * the computer reaches; the phone doesn't know it yet, so only GitHub pull requests pass.
 *
 * @example
 * messageParts("See https://github.com/acme/app/pull/12", undefined);
 * // [{ kind: "text", text: "See " }, { kind: "link", link: "https://github.com/acme/app/pull/12" }]
 */
export function messageParts(body: string, connectionOrigin?: string): readonly MessagePart[] {
  const parts: MessagePart[] = [];
  let text = "";
  let from = 0;
  for (const match of body.matchAll(linkPattern)) {
    const [matched, label, marked, bare] = match;
    // A full stop or comma after an address ends the sentence, not the address.
    const whole = bare === undefined ? matched : matched.replace(/[.,;:!?]+$/, "");
    const link = marked ?? whole;
    text += body.slice(from, match.index);
    from = match.index + whole.length;
    if (!isAllowedWebLink(link, connectionOrigin)) {
      text += whole;
      continue;
    }
    if (label !== undefined && label !== "" && label !== link) text += `${label} `;
    if (text !== "") parts.push({ kind: "text", text });
    parts.push({ kind: "link", link });
    text = "";
  }
  text += body.slice(from);
  if (text !== "") parts.push({ kind: "text", text });
  return parts;
}

/** Opens `link` in the system browser, checking it once more first; `false` when refused. */
export function openChecked(
  link: string,
  connectionOrigin: string | undefined,
  open: (link: string) => void,
): boolean {
  if (!isAllowedWebLink(link, connectionOrigin)) return false;
  open(link);
  return true;
}
