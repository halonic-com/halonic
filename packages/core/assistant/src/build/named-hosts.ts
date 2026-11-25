// What the person named in a Build chat (`assistant.build.named-hosts-secrets`):
// the hosts and the sign-ins in their own messages. Text they pasted counts
// as named, since a message can't tell pasting from typing. Tool results,
// fetched docs and the model's own text never count.

import { asciiHost } from "@halonicjs/std";
import type { AskedHost } from "./asked-hosts.ts";

/** A sign-in the person can name: an API key or a token. */
export type SignInKind = "api-key" | "token";

/** The hosts and sign-ins the person named in their messages. */
export interface Named {
  /** Host names as {@link normalHost} gives them, such as `api.example.com` or `api.example.com:8443`. */
  readonly hosts: ReadonlySet<string>;
  /** IP addresses and `localhost` exactly as typed, only in lower case, such as `127.0.0.1:8080`. */
  readonly local: ReadonlySet<string>;
  readonly signIns: ReadonlySet<SignInKind>;
}

/**
 * A host as the person may type it: an optional scheme, a name of letters
 * in any script, digits and `-` with at least one dot, an IPv4 address, a
 * bracketed IPv6 address or `localhost`, and an optional port. The groups
 * are the scheme, the name and the port.
 */
export const hostPattern = String.raw`(?:(https?):\/\/)?(\[[0-9a-f:.]+\]|(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}\p{N}-]+\.?|localhost\.?)(?::(\d{1,5}))?`;

/**
 * A host in the person's text: {@link hostPattern}, not starting inside a
 * longer word, name or path, so `api.example.com` gives no `example.com`
 * as well, and the domain of an e-mail address isn't a host.
 */
const typedHost = new RegExp(String.raw`(?<![\p{L}\p{N}.\-@/])${hostPattern}`, "giu");

const signInWords: readonly (readonly [SignInKind, RegExp])[] = [
  ["api-key", /\bapi[\s_-]?keys?\b/iu],
  ["token", /\btokens?\b/iu],
];

/**
 * The hosts and sign-ins in the person's own messages.
 *
 * @param messages - the person's messages in this chat, and nothing else
 *
 * @example
 * namedIn(["My notes are at https://API.Notes.Example.com:443/v1. I have an API key."]);
 * // { hosts: Set { "api.notes.example.com" }, local: Set {}, signIns: Set { "api-key" } }
 */
export function namedIn(messages: readonly string[]): Named {
  const hosts = new Set<string>();
  const local = new Set<string>();
  const signIns = new Set<SignInKind>();
  for (const message of messages) {
    for (const match of message.matchAll(typedHost)) {
      const [, scheme, name = "", port] = match;
      const typed = port === undefined ? name : `${name}:${port}`;
      if (isLocal(name)) {
        // A dot at the end of a sentence isn't part of an address.
        local.add(typed.toLowerCase().replace(/\.$/u, ""));
      } else {
        hosts.add(normalHost(name, port, scheme ?? "https"));
      }
    }
    for (const [kind, words] of signInWords) {
      if (words.test(message)) signIns.add(kind);
    }
  }
  return { hosts, local, signIns };
}

/**
 * A host name to compare: in lower case and ASCII (an IDN in Punycode),
 * without a trailing dot, and with its port unless it is the scheme's
 * default.
 *
 * @example
 * normalHost("Bücher.Example.", "443", "https"); // "xn--bcher-kva.example"
 */
export function normalHost(name: string, port: string | undefined, scheme = "https"): string {
  const host = asciiHost(name.replace(/\.$/u, ""));
  const defaultPort = scheme.toLowerCase() === "http" ? "80" : "443";
  return port === undefined || Number(port) === Number(defaultPort) ? host : `${host}:${port}`;
}

/**
 * Whether `name` is an IP address or `localhost`: a bracketed address, a
 * name ending in a number (which a URL reads as IPv4, `127.1` included),
 * or `localhost` and the names under it. Private addresses are IP addresses,
 * so this takes them in too.
 */
export function isLocal(name: string): boolean {
  const lower = name.toLowerCase().replace(/\.$/u, "");
  return (
    lower.startsWith("[") ||
    /(?:^|\.)(?:\d+|0x[0-9a-f]*)$/u.test(lower) ||
    lower === "localhost" ||
    lower.endsWith(".localhost")
  );
}

/**
 * Whether a host a file asks for is one the person named. A host name is
 * normalised and must match exactly: no wildcards, and a subdomain or a
 * parent domain of a named host doesn't count. An IP address or `localhost`
 * must be what the person typed, only case aside.
 *
 * @param host - the host as the file writes it: an IPv6 address keeps its brackets
 */
export function isNamed(named: Named, host: AskedHost): boolean {
  const { name, port, scheme } = host;
  if (isLocal(name)) {
    return named.local.has((port === undefined ? name : `${name}:${port}`).toLowerCase());
  }
  return named.hosts.has(normalHost(name, port, scheme));
}
