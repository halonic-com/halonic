import { createHash } from "node:crypto";

/**
 * Known secret and key formats. Each rule matches one kind of credential
 * that has a fixed, recognisable shape, so the rules stay precise enough
 * to run on every commit. `gitleaks` in CI adds a wider net on top.
 */
export interface SecretRule {
  /** The rule name, as used in reports and in the allow file. */
  readonly name: string;
  /** What the rule finds, in a few words. */
  readonly label: string;
  /** Matches the secret itself. Must have the `g` flag. */
  readonly pattern: RegExp;
}

/**
 * A literal value after a field name: quoted after `:` or `=`
 * (`"access_token": "…"`, `access_token = '…'`), or bare straight after `=`
 * as in a query string or form body. A variable after the name
 * (`access_token: tokens.access`) is never a match.
 */
const assigned = String.raw`(?:["']?\s*[:=]\s*["']|=)`;

/** An OAuth token or code: URL-safe characters, percent-escapes and base64. */
const oauthValue = String.raw`[A-Za-z0-9._~%/+=-]{16,}`;

/**
 * The end of an OAuth value. A lookahead after a value must follow this, so
 * the regex engine can't shorten the value one character at a time and run
 * the lookahead again: on a long line that takes quadratic time.
 */
const oauthValueEnd = String.raw`(?![A-Za-z0-9._~%/+=-])`;

/**
 * `code` is a common word, so it counts only in the two places where it is
 * the OAuth authorization code: a query string or form body
 * (`?code=…`, `&code=…`), and a token request, which names a `grant_type`
 * on the same line, before or after the code.
 */
const oauthCodePattern = new RegExp(
  [
    String.raw`(?<=[?&]code=)${oauthValue}`,
    String.raw`(?<=\bgrant_type\b.*\bcode${assigned})${oauthValue}`,
    String.raw`(?<=\bcode${assigned})${oauthValue}${oauthValueEnd}(?=.*\bgrant_type\b)`,
  ].join("|"),
  "g",
);

export const secretRules: readonly SecretRule[] = [
  {
    name: "private-key",
    label: "a private key block",
    pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g,
  },
  {
    name: "aws-access-key",
    label: "an AWS access key ID",
    pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g,
  },
  {
    name: "aws-secret-key",
    label: "an AWS secret access key",
    pattern:
      /(?<=\baws_?secret_?access_?key["']?\s*[:=]\s*["']?)[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+])/gi,
  },
  {
    name: "github-token",
    label: "a GitHub token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g,
  },
  {
    name: "npm-token",
    label: "an npm token",
    pattern: /\bnpm_[A-Za-z0-9]{36}\b/g,
  },
  {
    name: "slack-token",
    label: "a Slack token or webhook",
    pattern:
      /\bxox[abposr]-[A-Za-z0-9-]{10,}|https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g,
  },
  {
    name: "google-api-key",
    label: "a Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g,
  },
  {
    // Google OAuth client secrets, always with this prefix.
    name: "google-client-secret",
    label: "a Google OAuth client secret",
    pattern: /\bGOCSPX-[A-Za-z0-9_-]{20,}/g,
  },
  {
    // The secret fields of an OAuth token request or answer, holding a literal value.
    // `id_token` carries the user's e-mail address; `code_verifier` is the PKCE secret.
    name: "oauth-field",
    label: "an OAuth client secret or token",
    pattern: new RegExp(
      String.raw`(?<=\b(?:client_secret|refresh_token|access_token|id_token|code_verifier)${assigned})${oauthValue}`,
      "g",
    ),
  },
  {
    name: "oauth-code",
    label: "an OAuth authorization code",
    pattern: oauthCodePattern,
  },
  {
    name: "stripe-key",
    label: "a Stripe live key",
    pattern: /\b[rs]k_live_[A-Za-z0-9]{20,}\b/g,
  },
  {
    name: "ai-provider-key",
    label: "an AI provider API key",
    pattern: /\bsk-(?:ant-[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{10,}T3BlbkFJ[A-Za-z0-9_-]{10,})/g,
  },
  {
    // Signed tokens: header, claims and signature, the first two being
    // base64 JSON (`eyJ` is `{"`). Agent API keys and broker tokens have
    // this shape, and they are the secrets most likely to be pasted here.
    name: "jwt",
    label: "a signed access token (JWT)",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: "gitlab-token",
    label: "a GitLab token",
    pattern: /\bglpat-[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: "huggingface-token",
    label: "a Hugging Face token",
    pattern: /\bhf_[A-Za-z0-9]{34,}\b/g,
  },
  {
    // A URL with a login, user then password before the host. Only the
    // password part is matched.
    name: "url-password",
    label: "a password in a URL",
    pattern: /(?<=\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s:/@]{6,}(?=@)/gi,
  },
  {
    // An `.npmrc` line such as `//registry.npmjs.org/:_authToken=…`.
    name: "npm-auth-token",
    label: "an npm registry auth token",
    pattern: /(?<=:_authToken=)(?!\$\{)[^\s"']{16,}/g,
  },
];

/**
 * Rules whose match starts with a well-known public prefix (`ghp_`,
 * `AKIA`, `eyJ` …). For the others, even the first characters are secret.
 */
const rulesWithPublicPrefix = new Set([
  "aws-access-key",
  "github-token",
  "npm-token",
  "slack-token",
  "google-api-key",
  "google-client-secret",
  "stripe-key",
  "ai-provider-key",
  "jwt",
  "gitlab-token",
  "huggingface-token",
]);

/**
 * True for values that only look like a secret: the documented AWS
 * examples (they end in `EXAMPLE` or `EXAMPLEKEY`) and filler such as
 * `ghp_XXXXXXXX…`. A real key never has either shape.
 */
export function isPlaceholder(value: string): boolean {
  if (value.includes("EXAMPLE")) {
    return true;
  }
  const tail = value.slice(-16);
  return new Set(tail).size <= 3;
}

/**
 * Shows only the length and, when the rule has one, the first four
 * characters (the well-known prefix, such as `ghp_` or `AKIA`), so a
 * report never repeats a secret.
 */
export function maskSecret(rule: string, value: string): string {
  const prefix = rulesWithPublicPrefix.has(rule) ? value.slice(0, 4) : "";
  return `${prefix}${"*".repeat(8)} (${value.length} characters)`;
}

/**
 * A short, one-way fingerprint of a matched value. The allow file names
 * a secret-shaped value by fingerprint, so it can allow exactly that value
 * and nothing else, without the value itself entering the repo.
 */
export function fingerprint(value: string): string {
  return `fp:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}
