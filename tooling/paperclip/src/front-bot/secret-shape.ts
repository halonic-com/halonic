import { findSecretShape } from "@halonicjs/std";

/*
 * The front bot reads and writes text that agents' keys can end up in, so it
 * checks for more shapes than Studio's shared `findSecretShape` (Julian's
 * security review of HAL-19136):
 *
 * - A JWT: our agent keys and broker tokens have this shape. Its header and
 *   payload are base64url JSON, so each starts with `eyJ` (`{"`).
 * - GitHub's other tokens: `ghs_` (an app's installation token, as the broker
 *   hands out), `gho_`, `ghu_` and `ghr_`. `ghp_` and `github_pat_` are
 *   already in `findSecretShape`.
 */
const notAfterKeyCharacter = "(?<![A-Za-z0-9_-])";
const base64urlPart = "[A-Za-z0-9_-]";

const jwtPattern = new RegExp(
  `${notAfterKeyCharacter}eyJ${base64urlPart}{8,}\\.eyJ${base64urlPart}{8,}\\.${base64urlPart}*`,
);
const githubTokenPattern = new RegExp(
  `${notAfterKeyCharacter}gh[sour]_(?=[a-z_-]*[A-Z0-9])${base64urlPart}{16,}`,
);

/**
 * Whether text holds something shaped like a key or token. The answer is a
 * yes or no only: when it is yes, never log or keep the text.
 */
export function holdsSecretShape(text: string): boolean {
  return (
    findSecretShape(text) !== undefined || jwtPattern.test(text) || githubTokenPattern.test(text)
  );
}
