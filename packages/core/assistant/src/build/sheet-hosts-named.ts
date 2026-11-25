// Which of a sheet's hosts the person named in a Build chat, for the
// "added by the assistant" mark the review service records at Accept
// (HAL-525). It reads the person's messages the way the Build chat's gate
// does (`namedIn`), so a host the gate let through because the person named
// it is never marked.

import { writtenHost } from "./asked-hosts.ts";
import { isNamed, namedIn } from "./named-hosts.ts";

/**
 * Whether the person named a host as a sheet's `hosts` writes it, such as
 * `api.example.com` or `api.example.com:8443`.
 *
 * @param messages - the person's own messages in the chat, and nothing else
 *
 * @example
 * const named = sheetHostsNamedIn(["My notes are at https://api.notes.example.com/v1."]);
 * named("api.notes.example.com"); // true
 * named("cdn.notes.example.com"); // false
 */
export function sheetHostsNamedIn(messages: readonly string[]): (host: string) => boolean {
  const named = namedIn(messages);
  return (host) => isNamed(named, writtenHost(host));
}
