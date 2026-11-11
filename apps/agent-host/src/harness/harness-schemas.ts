import type { HarnessInput, HarnessTask } from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
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

export const harnessBody = s.object({ harness: id }).strict();

/**
 * What Studio gives to start a harness run: the task, and the sandbox session
 * and bridge it opened on this host before, by their ids. The bridge's token
 * stays here: Studio names the bridge, and the host passes its address and
 * token to the harness.
 */
export const startRunBody = s.object({ harness: id, task, session: id, bridge: id }).strict();

export const sendRunBody = s.object({ run: id, input }).strict();

export const runBody = s.object({ run: id }).strict();
