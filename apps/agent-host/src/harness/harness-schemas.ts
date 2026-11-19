import type { HarnessInput, HarnessTask } from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
import { absolutePath } from "../sandbox/profile-schema.ts";
import { portSchema } from "../server/port-schema.ts";

const id = s.string().min(1);

const task = portSchema<HarnessTask>(
  s
    .object({
      runId: id,
      hubId: id,
      agentId: id,
      instructions: s.string(),
      prompt: s.string(),
      model: id.optional(),
    })
    .strict(),
);

const input = portSchema<HarnessInput>(
  s.discriminatedUnion("type", [
    s.object({ type: s.literal("answer"), text: s.string() }).strict(),
    s
      .object({
        type: s.literal("approval"),
        callId: id,
        approved: s.boolean(),
        comment: s.string().optional(),
      })
      .strict(),
  ]),
);

/** What Studio gives to detect a harness: which one, and the agent's settings folder when it asks for one agent. */
export const detectBody = s
  .object({ harness: id, settingsFolder: absolutePath.optional() })
  .strict();

/**
 * What Studio gives to start a harness run: the task, and the sandbox session
 * and bridge it opened on this host before, by their ids. The bridge's token
 * stays here: Studio names the bridge, and the host passes its address and
 * token to the harness.
 */
export const startRunBody = s.object({ harness: id, task, session: id, bridge: id }).strict();

export const sendRunBody = s.object({ run: id, input }).strict();

export const runBody = s.object({ run: id }).strict();

/** A harness's sign-in for one agent, by the agent's settings folder (an absolute path). */
export const signInBody = s.object({ harness: id, settingsFolder: absolutePath }).strict();

/**
 * What Studio gives to ask for a harness call's sandbox profile: the workspace
 * (one the launcher named), what the agent's file says about its working
 * folder and sites, the run's proposal folder when it has one, and the bridge
 * it opened here, by id. The bridge's token stays here, as at the start of a
 * run, and so do the data folder, the home folder and the program's
 * variables: the host knows them, and Studio can't widen them.
 */
export const profileBody = s
  .object({
    workspace: absolutePath,
    agent: s
      .object({
        runId: id,
        hubId: id,
        agentId: id,
        harness: id,
        workingFolder: s.string().min(1).nullable(),
        allowedSites: s.array(s.string().min(1)),
        filesFolder: absolutePath.nullable(),
      })
      .strict(),
    bridge: id,
    instructionsFolder: absolutePath.nullable(),
  })
  .strict();

/**
 * What Studio gives to make a run's instructions folder: the workspace (one
 * the launcher named) and the files, by name and text. The host picks where
 * the folder goes, and refuses a name that isn't `AGENTS.md` or a skill's
 * `SKILL.md`.
 */
export const instructionsBody = s
  .object({
    workspace: absolutePath,
    files: s.array(s.object({ name: s.string().min(1), text: s.string() }).strict()).min(1),
  })
  .strict();

/** A run's instructions folder to remove, as the host answered it. */
export const releaseInstructionsBody = s.object({ folder: absolutePath }).strict();

/**
 * What Studio gives to learn an agent's own settings folder: the workspace
 * (one the launcher named), the agent's id and its harness. The host picks
 * the folder, in Halonic's data folder.
 */
export const settingsFolderBody = s
  .object({ workspace: absolutePath, agentId: id, harness: id })
  .strict();
