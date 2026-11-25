// Which addresses `read_docs` reads (`assistant.build.read-docs`): a public
// https page, on port 443, with no user name, password or query. A query is
// refused outright, not dropped, so the model can't put data in one; the
// fragment never leaves this computer, so it is dropped.

import { urlHost } from "@halonicjs/std";
import { trustUrl } from "@halonicjs/workspace";
import { isLocal, normalHost } from "../named-hosts.ts";
import { docsTexts } from "./docs-texts.ts";

/** An address `read_docs` may fetch, once the person allows its host. */
export interface DocsUrl {
  /** The address to fetch: `https://`, the host as {@link normalHost} gives it, and the path. */
  readonly url: string;
  /** The exact host the person allows, such as `docs.example.com`. */
  readonly host: string;
}

/** Why an address is refused, as the model reads it. */
export interface RefusedUrl {
  readonly refused: string;
}

/**
 * Name endings that only mean something on a private network, so a public
 * docs site never has them. A name of one label, such as `intranet`, is
 * private too.
 */
const privateEndings = [
  "local",
  "localdomain",
  "internal",
  "intranet",
  "lan",
  "home",
  "corp",
  "private",
  "home.arpa",
];

/**
 * Checks an address the model gave `read_docs`, before anything is fetched.
 *
 * @example
 * checkDocsUrl("https://Docs.Example.com/api#auth"); // { url: "https://docs.example.com/api", host: "docs.example.com" }
 * checkDocsUrl("https://docs.example.com/api?key=1"); // { refused: "Couldn't read that: …" }
 */
export function checkDocsUrl(raw: string): DocsUrl | RefusedUrl {
  const written = trustUrl(raw);
  if ("refused" in written || /\s/u.test(raw)) {
    return { refused: docsTexts.notAnAddress };
  }
  const match = /^https:\/\/([^/?#]*)([^#]*)/u.exec(written.url);
  if (match === null) {
    return { refused: docsTexts.httpsOnly };
  }
  const [, authority = "", path = ""] = match;
  if (path.includes("?")) {
    return { refused: docsTexts.noQuery };
  }
  const host = urlHost(written.url);
  if (host === undefined) {
    return { refused: docsTexts.notAnAddress };
  }
  if (host.kind !== "domain" || isLocal(host.name) || isPrivateName(host.name)) {
    return { refused: docsTexts.notPublic };
  }
  // `trustUrl` already left out port 443, so any port still there is another one.
  if (authority.includes(":")) {
    return { refused: docsTexts.otherPort };
  }
  const name = normalHost(host.name, undefined);
  return { url: `https://${name}${path}`, host: name };
}

function isPrivateName(name: string): boolean {
  return (
    !name.includes(".") ||
    privateEndings.some((ending) => name === ending || name.endsWith(`.${ending}`))
  );
}

/**
 * An address as the log keeps it: without its query or fragment, which are
 * marked `?…` and `#…`, and at most 500 characters. Even a refused address
 * is logged, and its query is where a key would go.
 *
 * @example
 * loggedUrl("https://docs.example.com/a?key=1"); // "https://docs.example.com/a?…"
 */
export function loggedUrl(raw: string): string {
  const cut = /[?#]/u.exec(raw);
  const kept = cut === null ? raw : `${raw.slice(0, cut.index)}${cut[0]}…`;
  const visible = kept.replace(/[\p{Cc}\p{Cf}]/gu, "");
  return visible.length <= 500 ? visible : `${visible.slice(0, 500)}…`;
}
