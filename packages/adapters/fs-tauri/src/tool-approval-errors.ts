import type { Read } from "@halonicjs/adapter-tool-approval-kit";
import {
  type ToolApproval,
  type ToolApprovalKey,
  UnreadableToolApprovalError,
} from "@halonicjs/ports";

/** A source of approvals in one workspace: a key without the tool's name. */
export type SourceKey = Omit<ToolApprovalKey, "name">;

/** A key as people read it, such as `tool "lookup" of "notes" in "/workspaces/acme"`. */
export function describeKey(key: ToolApprovalKey): string {
  return `tool ${JSON.stringify(key.name)} of ${describeSource(key)}`;
}

/** A source as people read it, such as `"notes" in "/workspaces/acme"`. */
export function describeSource(key: SourceKey): string {
  return `${JSON.stringify(key.source)} in ${JSON.stringify(key.location)}`;
}

/** The approval that was read, or the error for one that wasn't. */
export function believed(
  key: ToolApprovalKey,
  file: string,
  found: Read<ToolApproval>,
): ToolApproval {
  switch (found.kind) {
    case "read":
      return found.value;
    case "newer":
      throw newer(key, file, found.problem);
    case "damaged":
      throw unreadable(key, file, new Error(`It can't be believed: ${found.problem}.`));
  }
}

/** For an approval that can't be read, with the tool's name. */
export function unreadable(key: ToolApprovalKey, file: string, cause: unknown): Error {
  return new UnreadableToolApprovalError(
    key,
    key.name,
    `The approval for ${describeKey(key)} can't be read (${JSON.stringify(file)}).`,
    { cause },
  );
}

/** For an approval a newer Halonic wrote, which this one can't read or replace. */
export function newer(key: ToolApprovalKey, file: string, problem: string): Error {
  return new UnreadableToolApprovalError(
    key,
    key.name,
    `The approval for ${describeKey(key)} was written by a newer Halonic (${problem}), so this one can't read it or replace it. Update Halonic, or revoke the approval (${JSON.stringify(file)}).`,
  );
}

/** For a waiting file a newer Halonic wrote, which this one leaves alone. */
export function newerWaiting(key: SourceKey, file: string, problem: string): Error {
  return new Error(
    `The waiting tools of ${describeSource(key)} were written by a newer Halonic (${problem}), so this one leaves them alone. Update Halonic (${JSON.stringify(file)}).`,
  );
}

/** For an approval whose tool can't be read either: names the file, which can be deleted by hand. */
export function unreadableFile(key: SourceKey, file: string, cause?: unknown): Error {
  return new UnreadableToolApprovalError(
    key,
    null,
    `An approval of ${describeSource(key)} can't be read, nor which tool it is for (${JSON.stringify(file)}). Delete the file to remove it.`,
    { cause },
  );
}
