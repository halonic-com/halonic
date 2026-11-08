/**
 * Fake secrets, paths and terms for the leak-guard tests. Every value is
 * built while the test runs, so the test files themselves hold no
 * secret-shaped text and no absolute path: the leak guard and `gitleaks`
 * scan them like any other file.
 */

const mixed = "Q7x2Lm9Kp4Rt8Vw3Zc6Nb5Hj1Fd0GsYa";
const upper = "Q7X2LM9KP4RT8VW3ZC6NB5HJ1FD0GSYA";

/** A varied run of letters and digits, so it never looks like a placeholder. */
export function filler(length: number, alphabet: string = mixed): string {
  let result = "";
  while (result.length < length) {
    result += alphabet;
  }
  return result.slice(0, length);
}

/** One fake value per secret rule, keyed by rule name. */
export const fakeSecrets: Readonly<Record<string, string>> = {
  "private-key": ["-----BEGIN", "OPENSSH PRIVATE KEY-----"].join(" "),
  "aws-access-key": `AKIA${filler(16, upper)}`,
  "aws-secret-key": `aws_secret_access_key = ${filler(40)}`,
  "github-token": `ghp_${filler(36)}`,
  "npm-token": `npm_${filler(36)}`,
  "slack-token": `xoxb-${filler(24)}`,
  "google-api-key": `AIza${filler(35)}`,
  "google-client-secret": `GOCSPX-${filler(28)}`,
  "oauth-field": `"refresh_token": "${filler(40)}"`,
  "oauth-code": `https://127.0.0.1:8085/callback?state=x&code=${filler(40)}`,
  "stripe-key": `sk_live_${filler(24)}`,
  "ai-provider-key": `sk-ant-${filler(40)}`,
  jwt: `eyJ${filler(20)}.eyJ${filler(60)}.${filler(43)}`,
  "gitlab-token": `glpat-${filler(20)}`,
  "huggingface-token": `hf_${filler(34)}`,
  "url-password": `${["https://deploy", filler(20)].join(":")}@example.com/repo.git`,
  "npm-auth-token": `//registry.npmjs.org/:_authToken=${filler(36)}`,
};

/** Joins folder names into an absolute path: `absolute("home", "x")` → slash home slash x. */
export function absolute(...parts: string[]): string {
  return `/${parts.join("/")}`;
}

/** Made-up personal terms. The real list never enters the repo. */
export const testTerms = ["Quillfeather", "Marrowby Zent"];
