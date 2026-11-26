import { findSecretShape } from "@halonicjs/std";

/**
 * The front bot's key-shape check (HAL-19136, Julian's security review on
 * HAL-19163). Studio's `findSecretShape` knows only the keys a person pastes
 * into Studio. A chat task can hold any secret the team handles, and the most
 * likely ones (agent API keys and broker tokens) are JWTs. So the bot also
 * checks the shapes of the repo's leak guard (`tooling/check/src/leaks/secrets.ts`),
 * and a change there belongs here too.
 *
 * Only the kind leaves the check, never the text that matched.
 */

/** The kinds of credential the check spots, beyond Studio's. */
type ExtraShape =
  | "private-key"
  | "aws-access-key"
  | "aws-secret-key"
  | "github-token"
  | "npm-token"
  | "slack-token"
  | "stripe-key"
  | "jwt"
  | "gitlab-token"
  | "huggingface-token"
  | "url-password"
  | "npm-auth-token"
  | "oauth-field"
  | "oauth-code";

export type CredentialShape = NonNullable<ReturnType<typeof findSecretShape>> | ExtraShape;

/** A literal value after a field name, quoted after `:` or `=`, or bare after `=`. */
const assigned = String.raw`(?:["']?\s*[:=]\s*["']?)`;

const oauthValue = `[A-Za-z0-9._~%/+=-]{16,}`;

/** The value ends here: without this, a failed match retries every shorter value. */
const oauthValueEnd = `(?![A-Za-z0-9._~%/+=-])`;

/**
 * `code` is a common word, so, as in the leak guard, it counts only as a
 * sign-in code: in a query string or form body (`?code=…`, `&code=…`), or in
 * a token request that names `grant_type` on the same line.
 *
 * The check runs on every earlier comment in a chat, not only on the short
 * reply. Both token-request alternatives look across the line, so, as in the
 * leak guard, they run one line at a time and only on lines that name
 * `grant_type`; otherwise a long comment takes seconds.
 */
const oauthCodeInQuery = new RegExp(`[?&]code=${oauthValue}`);
const grantType = /\bgrant_type\b/;
const oauthCodeInTokenRequest = new RegExp(
  [
    String.raw`\bgrant_type\b.*\bcode${assigned}${oauthValue}`,
    String.raw`\bcode${assigned}${oauthValue}${oauthValueEnd}.*\bgrant_type\b`,
  ].join("|"),
);

function hasOAuthCode(text: string): boolean {
  if (oauthCodeInQuery.test(text)) {
    return true;
  }
  return text
    .split("\n")
    .some((line) => grantType.test(line) && oauthCodeInTokenRequest.test(line));
}

const extraPatterns: ReadonlyArray<readonly [ExtraShape, RegExp]> = [
  ["private-key", /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ["aws-access-key", /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/],
  ["aws-secret-key", /\baws_?secret_?access_?key["']?\s*[:=]\s*["']?[A-Za-z0-9/+]{40}/i],
  // Mixed case or digits after the prefix, as in Studio's check, so `ghs_` named in a sentence doesn't count.
  [
    "github-token",
    /\b(?:gh[pousr]_(?=[a-z_-]*[A-Z0-9])[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{22,})/,
  ],
  ["npm-token", /\bnpm_[A-Za-z0-9]{36}\b/],
  [
    "slack-token",
    /\bxox[abposr]-[A-Za-z0-9-]{10,}|https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/,
  ],
  ["stripe-key", /\b[rs]k_live_[A-Za-z0-9]{20,}/],
  // Header and claims are base64url JSON (`eyJ` is `{"`); an unsigned token still counts.
  ["jwt", /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\./],
  ["gitlab-token", /\bglpat-[A-Za-z0-9_-]{20,}/],
  ["huggingface-token", /\bhf_[A-Za-z0-9]{34,}/],
  ["url-password", /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s:/@]{6,}@/i],
  ["npm-auth-token", /:_authToken=(?!\$\{)[^\s"']{16,}/],
  [
    "oauth-field",
    new RegExp(
      String.raw`\b(?:client_secret|refresh_token|access_token|id_token|code_verifier)${assigned}[A-Za-z0-9._~%/+=-]{16,}`,
    ),
  ],
];

/**
 * The kind of credential-shaped text found, or undefined. Studio's
 * shapes are checked first, so its kinds keep their names.
 *
 * When it finds something, never put the text in a log or a request.
 */
export function findCredentialShape(text: string): CredentialShape | undefined {
  const studio = findSecretShape(text);
  if (studio !== undefined) {
    return studio;
  }
  const extra = extraPatterns.find(([, pattern]) => pattern.test(text))?.[0];
  if (extra !== undefined) {
    return extra;
  }
  return hasOAuthCode(text) ? "oauth-code" : undefined;
}
