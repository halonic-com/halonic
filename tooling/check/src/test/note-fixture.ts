import type { PullRequest } from "../guard/approvals.ts";
import {
  approversFile,
  coveredObjects,
  coveredPaths,
  signatureLine,
  signedText,
} from "../guard/signatures.ts";
import { approvers, type Files, fakeGit, keyPair } from "./signing-fixture.ts";

export const julian = keyPair();
export const cto = keyPair();
export const branch = "julian/HAL-1337-example";
export const noteFile = `decisions/${branch}.md`;
export const base = "b".repeat(40);
export const head = "a".repeat(40);
export const pull: PullRequest = { repo: "halonic-com/halonic", number: 7, head, base };
export const baseFiles: Files = {
  [approversFile]: approvers({
    internal: [cto.publicKey],
    "user-visible": [cto.publicKey],
    guardians: [cto.publicKey, julian.publicKey],
  }),
  ".github/workflows/ci.yml": "on: pull_request\n",
};

export const note = (kind: string, ...covers: string[]) => `# Decision: change CI

- Approval: https://paperclip.example/HAL/issues/HAL-1337
- Kind: ${kind}

The build needs a new step.

## Covers

${covers.map((entry) => `- ${entry}`).join("\n")}
`;

/** `text` with a signature line over its Covers paths at the head, made with `privatePem`. */
export function signed(
  text: string,
  headFiles: Files,
  privatePem: string | readonly string[],
): string {
  const git = fakeGit({ [base]: baseFiles, [head]: headFiles });
  const kind = text.includes("Kind: internal") ? "internal" : "user-visible";
  const covers = (text.split("## Covers")[1] ?? "").match(/(?<=^- ).+$/gm) ?? [];
  const objects = coveredObjects(coveredPaths(covers, git, head, base), git, head);
  const facts = { repo: pull.repo, pr: pull.number, kind, unsigned: text, objects } as const;
  const lines = [privatePem].flat().map((pem) => `${signatureLine(signedText(facts), pem)}\n`);
  return text.replace(/(- Kind: .*\n)/, `$1${lines.join("")}`);
}
