import type { Path } from "@halonicjs/schema-kit";
import { findSecretShape } from "@halonicjs/std";
import type { KindCheckProblem } from "../kind.ts";
import { looksLikeKey } from "./secret-name.ts";

/*
 * A file holds only a secret's name, never the secret (save model 8.1). The
 * fields checked here take any text: a connector's HTTP headers, a local
 * program's `env` and `args`, and the adapter settings in `options` and
 * `config`. Two tests catch a key pasted into one:
 *
 * - The known key formats `findSecretShape` spots, anywhere in the text, so
 *   `Bearer sk-…` and `--api-key=sk-…` are caught too.
 * - Under a name that says it holds a credential (`Authorization`,
 *   `GITHUB_TOKEN`, `apiKey`), the full `looksLikeKey` test, once a leading
 *   `Bearer`, `Basic` or `Token` is dropped. Only a value made of key
 *   characters counts: without the name, or with a `.`, `:` or space left
 *   in it, the long-random-part test would also find addresses and paths
 *   such as `/opt/python3.12-tools`. A value that starts like a path
 *   (`/`, `./`, `../`, `~/`) is a path, such as `CREDENTIALS_DIR:
 *   /srv/runner/work/app2/creds`; a base64 key may hold a `/`, but doesn't
 *   start with one.
 */
const credentialName =
  /token|secret|passw(?:or)?d|api[-_]?key|access[-_]?key|private[-_]?key|credential|authorization|^auth$/i;
const authScheme = /^(?:bearer|basic|token)\s+/i;
const keyCharacters = /^[A-Za-z0-9+/=_-]+$/;
const pathStart = /^(?:\/|\.\.?\/|~\/)/;

/**
 * Whether a value in a free text field holds a key.
 * Only the answer leaves the check; when it is `true`, never repeat the value.
 *
 * @param value - the text from the file
 * @param name - the header, variable or setting the text belongs to
 */
function holdsKey(value: string, name: string | undefined): boolean {
  if (findSecretShape(value) !== undefined) {
    return true;
  }
  if (name === undefined || !credentialName.test(name)) {
    return false;
  }
  const credential = value.trim().replace(authScheme, "");
  return !pathStart.test(credential) && keyCharacters.test(credential) && looksLikeKey(credential);
}

/*
 * The words wait on the board (HAL-2264, P8), like those in
 * `secret-name.ts`. Each says where the secret's name goes instead.
 */
const opening = "This looks like an API key written into the file.";
const words = {
  header: `${opening} Remove it, store the key as a secret, and write the secret's name in the connector's secret, which is sent as a bearer token.`,
  env: `${opening} Remove it, store the key as a secret, and set this variable under secretEnv to the secret's name instead.`,
  arg: `${opening} Remove it, store the key as a secret, and give it to the program through secretEnv instead of its arguments.`,
  "provider-option": `${opening} Remove it, store the key as a secret, and write the secret's name in the provider's secret.`,
  setting: `${opening} Remove it and store the key as a secret, so the file can be shared and committed safely.`,
} as const;

/** Which field the text sits in, which picks the advice in the message. */
export type KeyPlace = keyof typeof words;

/**
 * Checks every text in a free field for a pasted key, down through nested
 * maps and lists, and reports each one as the error `value-looks-like-key`
 * at its own path. The message never repeats the value.
 *
 * @param value - the field's value from the file
 * @param path - where the field sits in the file
 * @param place - which advice the message gives
 * @param name - the name the value sits under, when the field itself is one entry
 * @returns one problem per text that holds a key
 *
 * @example
 * checkKeysIn({ Authorization: `Bearer sk-${"Q7x2Lm9K".repeat(4)}` }, ["headers"], "header");
 * // [{ code: "value-looks-like-key", path: ["headers", "Authorization"], … }]
 */
export function checkKeysIn(
  value: unknown,
  path: Path,
  place: KeyPlace,
  name?: string,
): KindCheckProblem[] {
  if (typeof value === "string") {
    return holdsKey(value, name)
      ? [{ severity: "error", code: "value-looks-like-key", path, message: words[place] }]
      : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => checkKeysIn(item, [...path, index], place, name));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      checkKeysIn(item, [...path, key], place, key),
    );
  }
  return [];
}
