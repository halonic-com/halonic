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
