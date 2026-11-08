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
    name: "stripe-key",
    label: "a Stripe live key",
    pattern: /\b[rs]k_live_[A-Za-z0-9]{20,}\b/g,
  },
  {
    name: "ai-provider-key",
    label: "an AI provider API key",
    pattern: /\bsk-(?:ant-[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{10,}T3BlbkFJ[A-Za-z0-9_-]{10,})/g,
  },
];

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
 * Shows only the first four characters (the well-known prefix, such as
 * `ghp_` or `AKIA`) and the length, so a report never repeats a secret.
 */
export function maskSecret(value: string): string {
  return `${value.slice(0, 4)}${"*".repeat(8)} (${value.length} characters)`;
}

/**
 * A short, one-way fingerprint of a matched value. The allow file names
 * a secret-shaped value by fingerprint, so it can allow exactly that value
 * and nothing else, without the value itself entering the repo.
 */
export function fingerprint(value: string): string {
  return `fp:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}
