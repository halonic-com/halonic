import { isWordsOnly } from "../reviewer-paths.ts";
import { lastPushOf } from "./approval.ts";
import { plainLines, requestsChanges } from "./signed.ts";
import type { GatePull, PullText } from "./snapshot.ts";

/**
 * The security sign-off wait (HAL-19404, Chief's OK 26 Nov 07:33 UTC; the
 * live Merger's `gate.js` since 07:34 UTC, mirrored by HAL-19508). A security
 * pull request is queued only once Julian's PR comment
 * `Julian: security sign-off on head <sha>` names its current head, posted
 * after the last push, with no change request of his after it. It is a gate
 * rule only: a queued pull request isn't taken out for it (no churn).
 *
 * A pull request is a security one by its `security` label, a line starting
 * `security-review` (or "security review") in its description, more changed
 * files than the gate can read (HAL-19778), or a changed path in the security
 * part of Julian's limits: `apps/studio/src-tauri/`, `docs/security/`,
 * `packages/core/action-catalog/` (HAL-20215), `SECURITY.md`, or a path naming sandbox, secret, sign-in, oauth, keychain
 * or trust. Changesets don't count, nor do lockfiles, `package.json` or CI
 * paths, which would hold every dependency pull request; nor, outside
 * `docs/security/` and `SECURITY.md`, do tests, Markdown and wording files,
 * by the same rule as `reviewerFor` (HAL-14809, HAL-20402). The gate's reason
 * names what made it a security pull request.
 */

/** The label that marks a security pull request. */
export const securityLabel = "security";

// The action catalog sets which GitHub calls the shell sends with the user's
// token, their risk and the web origins (HAL-20215).
const securityFolders: readonly string[] = [
  "apps/studio/src-tauri/",
  "docs/security/",
  "packages/core/action-catalog/",
];
const securityWords = /sandbox|secret|sign-in|oauth|keychain|trust/i;
const reviewLine = /^\s*security[- ]review\b/im;
const signOffLine = /^Julian:[ \t]*security sign-off on head[ \t]*`?([0-9a-f]{7,40})`?/;

function securityPath(path: string): boolean {
  if (path === "SECURITY.md" || path.startsWith("docs/security/")) {
    return true;
  }
  if (path.startsWith(".changeset/") || isWordsOnly(path)) {
    return false;
  }
  return securityFolders.some((folder) => path.startsWith(folder)) || securityWords.test(path);
}

/** What makes the pull request a security one, for the gate's reason, or undefined when nothing does. */
export function securityCause(pull: GatePull): string | undefined {
  if (pull.labels.includes(securityLabel)) {
    return `the \`${securityLabel}\` label`;
  }
  if (reviewLine.test(pull.body ?? "")) {
    return "a security-review line in its description";
  }
  if (pull.filesTotal > pull.files.length) {
    return `${pull.filesTotal} changed files, more than the gate reads`;
  }
  const path = pull.files.find(securityPath);
  return path === undefined ? undefined : `\`${path}\``;
}

/** The head a comment's one sign-off line names, or null: none, quoted or in code, or with a change request. */
function signedOffHead(body: string): string | null {
  const lines = plainLines(body);
  const heads = lines.flatMap((line) => {
    const sha = signOffLine.exec(line)?.[1];
    return sha === undefined ? [] : [sha];
  });
  if (heads.length !== 1 || requestsChanges(lines, "Julian")) {
    return null;
  }
  return heads[0] ?? null;
}

/** A change request Julian signs: "Julian:" opens a plain line of it, and it asks for changes. */
function julianRequest(text: PullText): boolean {
  const lines = plainLines(text.body);
  return lines.some((line) => line.startsWith("Julian:")) && requestsChanges(lines, "Julian");
}

/** Whether Julian's security sign-off holds on the head. */
export function signedOff(pull: GatePull, teamLogin: string): boolean {
  const texts = pull.texts
    .filter((text) => text.by === teamLogin && !/queue manager/i.test(text.body))
    .sort((a, b) => a.at.localeCompare(b.at));
  const signOff = texts
    .filter((text) => {
      const sha = signedOffHead(text.body);
      return sha !== null && pull.head.startsWith(sha) && text.at >= lastPushOf(pull);
    })
    .pop();
  if (signOff === undefined) {
    return false;
  }
  return !texts.some((text) => text.at > signOff.at && julianRequest(text));
}

/** The gate's reason for a security pull request still waiting for the sign-off, or undefined. */
export function securityReason(pull: GatePull, teamLogin: string): string | undefined {
  const cause = securityCause(pull);
  if (cause === undefined || signedOff(pull, teamLogin)) {
    return undefined;
  }
  return `security PR (${cause}): waiting for "Julian: security sign-off on head ${pull.head.slice(0, 9)}"`;
}
