import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { approvers, type Files, fakeGit, keyPair } from "../test/signing-fixture.ts";
import { type PullRequest, signedApprovals } from "./approvals.ts";
import { parseDecisionNote } from "./decision-notes.ts";
import { signNote } from "./sign-note.ts";
import { approversFile } from "./signatures.ts";

const cto = keyPair();
const stranger = keyPair();
const branch = "julian/HAL-1337-example";
const noteFile = `decisions/${branch}.md`;
const base = "b".repeat(40);
const head = "a".repeat(40);
const pull: PullRequest = { repo: "halonic-com/halonic", number: 7, head, base };

const note = `# Decision: drop a flaky test

- Approval: https://paperclip.example/HAL/issues/HAL-1337
- Kind: internal

It never tested anything.

## Covers

- packages/core/workflow/src/timer.test.ts
`;

const baseFiles: Files = {
  "packages/core/workflow/src/timer.test.ts": "test('fires')\n",
  [approversFile]: approvers({ internal: [cto.publicKey] }),
};

function sign(text: string, privatePem = cto.privatePem, onBase: Files = baseFiles) {
  const git = fakeGit({ [base]: onBase, [head]: { ...baseFiles, [noteFile]: text } });
  return { git, signed: signNote(pull, branch, git, privatePem) };
}

verifies("check.decision-sign", () => {
  test("prints the signed text and a line the guard then verifies", async () => {
    const { signed } = sign(note);
    expect(signed.ok && signed.text.split("\n").slice(0, 3)).toEqual([
      "halonic-decision-v1",
      "repo halonic-com/halonic",
      "pr 7",
    ]);
    const line = signed.ok ? signed.line : "";
    expect(line).toMatch(/^- Signature: ed25519:sha256:[\w-]{43}:[A-Za-z0-9+/]{86}==$/);
    const withLine = note.replace("- Kind: internal\n", `- Kind: internal\n${line}\n`);
    const git = fakeGit({ [base]: baseFiles, [head]: { ...baseFiles, [noteFile]: withLine } });
    const parsed = parseDecisionNote(noteFile, withLine);
    const verdict = parsed.ok && (await signedApprovals(pull, git).check({ note: parsed.note }));
    expect(verdict).toEqual({ approved: true });
  });

  test.each([
    [
      "a key the base doesn't pin",
      note,
      stranger.privatePem,
      baseFiles,
      /isn't pinned for internal/,
    ],
    [
      "a signed note",
      note.replace("- Kind", "- Signature: x\n- Kind"),
      cto.privatePem,
      baseFiles,
      /already has a signature/,
    ],
    ["a carriage return", note.replace("\n", "\r\n"), cto.privatePem, baseFiles, /carriage return/],
    [
      "a malformed note",
      note.replace("- Kind: internal\n", ""),
      cto.privatePem,
      baseFiles,
      /malformed/,
    ],
    [
      "a note already on main",
      note,
      cto.privatePem,
      { ...baseFiles, [noteFile]: note },
      /already on the base/,
    ],
    [
      "a broken approvers file on the base",
      note,
      cto.privatePem,
      { ...baseFiles, [approversFile]: "{ not json" },
      /can't be read/,
    ],
  ])("refuses %s", (_case, text, privatePem, onBase, reason) => {
    const { signed } = sign(text, privatePem, onBase);
    expect(signed.ok ? "signed" : signed.reason).toMatch(reason);
  });
});
