import { s } from "@halonicjs/schema-kit";
import { absolutePath } from "../sandbox/profile-schema.ts";

/**
 * Which agent a choice is for: the workspace's real path, the agent's hub and
 * its id. The hub is required: an agent id is unique only in its hub, so a
 * request without one is refused, never read as some hub (HAL-13203).
 */
export const keyBody = s
  .object({ location: absolutePath, hub: s.string().min(1), agent: s.string().min(1) })
  .strict();

/** What Studio gives to save a choice: every field of an `AgentPlacementRecord`, and no other. */
export const saveBody = s
  .object({
    location: absolutePath,
    hub: s.string().min(1),
    agent: s.string().min(1),
    runsOn: s.literal("this-computer"),
    agentFingerprint: s.string().min(1),
    chosenAt: s.string().min(1),
  })
  .strict();
