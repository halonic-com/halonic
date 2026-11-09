/**
 * The kinds of secret `findSecretShape` spots. Only the kind leaves the
 * check, never the text that matched, so a caller can't log or keep the key
 * by accident.
 */
export type SecretShape =
  | "ai-provider-key"
  | "google-client-secret"
  | "google-api-key"
  | "github-token"
  | "slack-token";

/*
 * Each pattern is a prefix at the start of a run of key characters (letters,
 * digits, `-` and `_`), so `task-…` or `xGOCSPX-…` never match, followed by
 * at least 16 more key characters, so words such as `sk-learn` or a prefix
 * named in a sentence don't count either.
 *
 * `sk-` covers OpenAI and Anthropic keys (`sk-proj-…`, `sk-ant-…`). `GOCSPX-`
 * is a Google OAuth client secret, which Studio sends to the Google setup's
 * secret field instead of the providers page.
 */
const patterns: ReadonlyArray<readonly [SecretShape, RegExp]> = [
  ["ai-provider-key", /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{16,}/],
  ["google-client-secret", /(?<![A-Za-z0-9_-])GOCSPX-[A-Za-z0-9_-]{16,}/],
  ["google-api-key", /(?<![A-Za-z0-9_-])AIza[A-Za-z0-9_-]{16,}/],
  ["github-token", /(?<![A-Za-z0-9_-])(?:ghp_|github_pat_)[A-Za-z0-9_-]{16,}/],
  ["slack-token", /(?<![A-Za-z0-9_-])xoxb-[A-Za-z0-9_-]{16,}/],
];

/**
 * Finds text shaped like an API key or other secret, so Studio can hold a
 * message before it is sent, saved or logged. The Assistant, Try it chats and
 * the Inbox all ask this one check, so they spot the same formats. When the
 * text holds more than one, the kind that comes first in the text wins.
 *
 * The answer is the kind only. When it finds something, never put the text
 * in a log or an error report: the text holds the key.
 *
 * @example
 * findSecretShape(`my key is sk-${"a".repeat(16)}`); // "ai-provider-key"
 * findSecretShape("we use sk-learn for this"); // undefined
 */
export function findSecretShape(text: string): SecretShape | undefined {
  let found: SecretShape | undefined;
  let foundAt = Number.POSITIVE_INFINITY;
  for (const [shape, pattern] of patterns) {
    const match = pattern.exec(text);
    if (match !== null && match.index < foundAt) {
      found = shape;
      foundAt = match.index;
    }
  }
  return found;
}
