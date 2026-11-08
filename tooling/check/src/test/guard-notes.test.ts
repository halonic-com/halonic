import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { paperclipApprovals } from "../guard/approvals.ts";
import type { GuardCheck } from "../guard/finding.ts";
import { branch, noteCovering, noteFile, runGuard } from "./guard-fixture.ts";

const file = "packages/core/workflow/requirements/timer-fires.md";
/** A check that always finds one change, standing in for the real ones. */
const findsAnEdit: GuardCheck = () => [
  {
    subject: "workflow.timer-fires",
    file,
    message: 'The active requirement "workflow.timer-fires" was edited.',
  },
];
const edited = { base: {}, head: {}, checks: [findsAnEdit] };

verifies("check.guard-needs-approved-note", () => {
  test("fails without a decision note, and names the note to add", async () => {
    const { errors } = await runGuard(edited);
    expect(errors).toEqual([
      `${file}: The active requirement "workflow.timer-fires" was edited. That needs a decision note: add ${noteFile}, list "workflow.timer-fires" under Covers and link an approval (plan 9.3).`,
    ]);
  });

  test("passes when the note lists the change and its approval is verified", async () => {
    const outcome = await runGuard({ ...edited, note: noteCovering("workflow.timer-fires") });
    expect(outcome.errors).toEqual([]);
    expect(outcome.warnings).toEqual([
      `${file}: The active requirement "workflow.timer-fires" was edited. Allowed by ${noteFile} (https://paperclip.example/HAL/approvals/1234).`,
    ]);
  });

  test("fails when the note doesn't list the change", async () => {
    const { errors } = await runGuard({ ...edited, note: noteCovering("workflow.other") });
    expect(errors).toEqual([
      `${file}: The active requirement "workflow.timer-fires" was edited. ${noteFile} doesn't list "workflow.timer-fires" under Covers.`,
    ]);
  });

  test("fails when the note's approval isn't verified", async () => {
    const note = noteCovering("workflow.timer-fires");
    const { errors } = await runGuard({ ...edited, note, approved: false });
    expect(errors).toEqual([
      `${file}: The active requirement "workflow.timer-fires" was edited. ${noteFile} covers it, but its approval isn't verified: the approval is for another branch.`,
    ]);
  });

  test("fails when the note is malformed, and points at the line to fix", async () => {
    const note = noteCovering("workflow.timer-fires").replace("- Kind: internal", "- Kind: big");
    const { errors } = await runGuard({ ...edited, note });
    expect(errors).toEqual([
      `${noteFile}: Malformed decision note: Add "- Kind: user-visible" or "- Kind: internal" (D13).`,
      `${file}: The active requirement "workflow.timer-fires" was edited. ${noteFile} can't be read, see its errors.`,
    ]);
  });

  test("passes without a note when nothing needs one", async () => {
    const findsNothing: GuardCheck = () => [];
    const outcome = await runGuard({ base: {}, head: {}, checks: [findsNothing] });
    expect(outcome).toEqual({ errors: [], warnings: [] });
  });
});

verifies("check.guard-approval-fails-closed", () => {
  test("the built-in Paperclip lookup verifies no approval yet", async () => {
    const verdict = await paperclipApprovals.check({
      approval: "https://paperclip.example/HAL/approvals/1234",
      branch,
      kind: "internal",
    });
    expect(verdict.approved).toBe(false);
    expect(!verdict.approved && verdict.reason).toMatch(/Paperclip API token.*HAL-58/);
  });
});
