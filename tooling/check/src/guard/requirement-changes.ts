import type { CheckContext } from "../lib/context.ts";
import {
  expectedRequirementId,
  isRequirementFile,
  parseRequirementFile,
  type Requirement,
} from "../lib/requirements.ts";
import { owningPackage } from "../lib/workspace.ts";
import type { Checkouts, GuardFinding } from "./finding.ts";

/**
 * Plan 9.3, point 2: an active requirement of the merge base may not be
 * edited, retired, demoted to draft, renamed or deleted without a note.
 * Draft and retired requirements may change freely.
 */
export function checkRequirementChanges({ base, head }: Checkouts): GuardFinding[] {
  const findings: GuardFinding[] = [];
  const headRequirements = requirementsIn(head);
  for (const before of requirementsIn(base)) {
    if (before.status !== "active") {
      continue;
    }
    const finding = (change: string): GuardFinding => ({
      subject: before.id,
      file: before.file,
      message: `The active requirement "${before.id}" ${change}.`,
    });
    if (!head.files.includes(before.file)) {
      const moved = headRequirements.find((after) => after.statement === before.statement);
      const change =
        moved === undefined ? "was deleted or renamed" : `was renamed to "${moved.id}"`;
      findings.push(finding(change));
      continue;
    }
    if (head.read(before.file) === base.read(before.file)) {
      continue;
    }
    const after = headRequirements.find((requirement) => requirement.file === before.file);
    if (after?.status === "retired") {
      findings.push(finding("was retired"));
    } else if (after?.status === "draft") {
      findings.push(finding("was demoted to draft"));
    } else {
      findings.push(finding("was edited"));
    }
  }
  return findings;
}

/** Every well-formed requirement file in a checkout. */
function requirementsIn(context: CheckContext): Requirement[] {
  const found: Requirement[] = [];
  for (const file of context.files) {
    const pkg = owningPackage(file, context.packages);
    if (!isRequirementFile(file) || pkg === undefined || pkg.directory === ".") {
      continue;
    }
    const expectedId = expectedRequirementId(file, pkg.directory);
    const parsed = parseRequirementFile(file, context.read(file), expectedId);
    if (parsed.ok) {
      found.push(parsed.requirement);
    }
  }
  return found;
}
