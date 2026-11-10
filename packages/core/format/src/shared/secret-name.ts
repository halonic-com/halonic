import { isSecretName, maxSecretNameLength } from "@halonicjs/ports";
import type { Path } from "@halonicjs/schema-kit";
import { findSecretShape } from "@halonicjs/std";
import type { KindCheckProblem } from "../kind.ts";

/*
 * A key pasted where a secret's name belongs fits the name rule more often
 * than not (`sk-ant-api03-…` is a letter, then letters, digits and `-`), so
 * the rule alone lets it through and every later message repeats it. Three
 * tests catch it:
 *
 * - The known key formats `findSecretShape` spots (`sk-`, `GOCSPX-`, `AIza`,
 *   `ghp_`, `github_pat_`, `xoxb-`), the same check Studio asks before a
 *   chat message is sent.
 * - A UUID anywhere in the value. Many services issue keys as a bare UUID,
 *   whose parts are too short for the next test.
 * - A long random part: between the `-` and `_` that split a name, a run of
 *   at least 20 characters that mixes letters and digits. Names people
 *   write are words (`openai-key`, `SERVE_PASSWORD`), and a word of 20
 *   characters with digits in it is rare. Keys without a known prefix
 *   (hex tokens, other Slack tokens, cloud access keys) are such runs. An
 *   AWS access key ID is exactly 20 characters, so keep the length at 20.
 */
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const randomPartLength = 20;
const nameParts = /[-_]/;
const letter = /[A-Za-z]/;
const digit = /[0-9]/;

/**
 * Whether a value written as a secret's name looks like a key instead.
 * Only the answer leaves the check; when it is `true`, never repeat the value.
 *
 * @example
 * looksLikeKey("openai-key"); // false
 * looksLikeKey(`sk-ant-api03-${"Q7x2Lm9K".repeat(4)}`); // true
 */
export function looksLikeKey(value: string): boolean {
  if (findSecretShape(value) !== undefined || uuid.test(value)) {
    return true;
  }
  return value
    .split(nameParts)
    .some((part) => part.length >= randomPartLength && letter.test(part) && digit.test(part));
}

/*
 * The words wait on the board (HAL-2264, P8). They sit here, one per
 * problem, so the approved text replaces them in one place.
 */
const words = {
  "secret-looks-like-key":
    "This looks like an API key, not a secret's name. Remove it from the file, store the key as a secret, and write the secret's name here, such as openai-key.",
  "secret-name": (name: string) =>
    `The secret name "${name}" can't be used. Start with a letter, then use only letters, digits, - or _, such as openai-key.`,
  "secret-name-too-long": (length: number) =>
    `This secret name is ${length} characters long. Use at most ${maxSecretNameLength}, starting with a letter, then only letters, digits, - or _.`,
  "secret-name-characters":
    "This secret name has characters that can't be used. Start with a letter, then use only letters, digits, - or _.",
} as const;

const typoSeparators = /[ .]/g;

/**
 * Whether a name that breaks the rule does so the way a typo does: it
 * would pass with each space and dot written as `-` (`openai key`,
 * `openai.key`). Only such a name may be repeated in a message. Anything
 * else (`Hunter2!x`, `pass@word`) may be a password pasted by mistake, and
 * `halonic validate` output can end up in a CI log.
 *
 * @example
 * isTypoedSecretName("openai key"); // true
 * isTypoedSecretName("Hunter2!x"); // false
 */
function isTypoedSecretName(name: string): boolean {
  return isSecretName(name.replace(typoSeparators, "-"));
}

/** The `secret-name` message: the name quoted only when it is a typo. */
function badNameMessage(name: string): string {
  if (isTypoedSecretName(name)) {
    return words["secret-name"](name);
  }
  if (name.length > maxSecretNameLength) {
    return words["secret-name-too-long"](name.length);
  }
  return words["secret-name-characters"];
}

/**
 * Checks a value a file gives as a secret's name, before anything asks a
 * store for it. A key is refused first (`secret-looks-like-key`), then a
 * name that breaks the rule of the `Secrets` port (`secret-name`). Both are
 * errors, because the file may be committed. The message repeats the value
 * only when it doesn't look like a key and would pass the rule with its
 * spaces and dots written as `-`.
 *
 * @param name - the value from the file
 * @param path - where it sits in the file
 * @returns the problem, or `undefined` for a good name
 */
export function checkSecretName(name: string, path: Path): KindCheckProblem | undefined {
  if (looksLikeKey(name)) {
    return {
      severity: "error",
      code: "secret-looks-like-key",
      path,
      message: words["secret-looks-like-key"],
    };
  }
  if (isSecretName(name)) {
    return undefined;
  }
  return {
    severity: "error",
    code: "secret-name",
    path,
    message: badNameMessage(name),
  };
}
