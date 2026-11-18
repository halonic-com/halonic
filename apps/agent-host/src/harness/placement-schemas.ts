import { s } from "@halonicjs/schema-kit";
import { absolutePath } from "../sandbox/profile-schema.ts";

/** Which agent a choice is for: the workspace's real path and the agent's id. */
export const keyBody = s.object({ location: absolutePath, agent: s.string().min(1) }).strict();

/** What Studio gives to save a choice: every field of an `AgentPlacementRecord`, and no other. */
export const saveBody = s
  .object({
    location: absolutePath,
    agent: s.string().min(1),
    runsOn: s.literal("this-computer"),
    agentFingerprint: s.string().min(1),
    chosenAt: s.string().min(1),
  })
  .strict();
