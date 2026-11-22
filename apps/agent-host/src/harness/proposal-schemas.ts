import { s } from "@halonicjs/schema-kit";
import { absolutePath } from "../sandbox/profile-schema.ts";

const id = s.string().min(1);

const version = s
  .discriminatedUnion("reads", [
    s.object({ reads: s.literal("live-version"), commit: id, versionDate: id }).strict(),
    s.object({ reads: s.literal("saved-files") }).strict(),
  ])
  .nullable();

/** What Studio gives to open a run's folder: the workspace and the run, with the version its definitions were read from. */
export const openBody = s
  .object({
    workspace: absolutePath,
    run: s.object({ runId: id, hubId: id, workflowId: id, version }).strict(),
  })
  .strict();

export const folderOfBody = s.object({ workspace: absolutePath, runId: id }).strict();

export const endBody = folderOfBody;

/** What Studio gives at the engine's start: the runs it hasn't ended, whose folders stay. */
export const startBody = s.object({ workspace: absolutePath, openRuns: s.array(id) }).strict();

/** What Studio gives to list a workspace's open proposals. */
export const listBody = s.object({ workspace: absolutePath }).strict();

/** One file of the proposal, by its path from the workspace root, or every undecided file. */
const target = s.union([s.literal("all"), s.object({ file: id }).strict()]);

/** What Studio gives to accept or reject a proposal's files. */
export const decideBody = s.object({ workspace: absolutePath, runId: id, target }).strict();

/** What Studio gives to undo (`before`) or redo (`after`) a decision: the id the host answered for it. */
export const restoreBody = s
  .object({ workspace: absolutePath, undo: id, to: s.enum(["before", "after"]) })
  .strict();

/** What Studio gives to settle a proposal once its last Undo is gone. */
export const settleBody = folderOfBody;

/** What Studio gives to read a file's texts for Compare: the file by its path from the workspace root. */
export const compareBody = s.object({ workspace: absolutePath, runId: id, path: id }).strict();

/**
 * What Studio gives for a choice made in Compare, other than Keep mine (a
 * reject): the file, the choice, and the digest of the saved text Compare
 * showed (`absent` for no file), so a later edit is never written over.
 */
export const chooseBody = s
  .object({
    workspace: absolutePath,
    runId: id,
    path: id,
    choice: s.enum(["use-run", "combine-both"]),
    seen: s.union([s.literal("absent"), s.string().regex(/^sha256:[0-9a-f]{64}$/)]),
  })
  .strict();

/** What Studio gives to remove a proposal whose texts are gone. */
export const removeBody = folderOfBody;

/** What Studio gives to list a workspace's proposals settled in the last 30 days. */
export const doneBody = listBody;
