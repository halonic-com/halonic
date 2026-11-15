import { realpath } from "node:fs/promises";
import { FileInstructionTrustStore } from "@halonicjs/adapter-fs-node";
import { pinInstructions } from "@halonicjs/adapter-harness-kit";
import { InstructionTrustService } from "@halonicjs/app";
import { type ProfileEnvironment, profileFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { instructionTrustFolder } from "../local-harness-host.ts";

/**
 * Records, as a person's yes, that `agent`'s instructions in the workspace at
 * `workspace` are `text`, in the profile's trust store: what a harness run
 * through the CLI's host needs before its program starts.
 */
export async function trustInstructions(input: {
  readonly profile: ProfileEnvironment;
  readonly workspace: string;
  readonly agent: string;
  readonly text: string;
}): Promise<void> {
  const service = new InstructionTrustService({
    store: new FileInstructionTrustStore(instructionTrustFolder(profileFolder(input.profile))),
    clock: systemClock,
  });
  const pin = await pinInstructions([{ name: "AGENTS.md", text: input.text }]);
  await service.trust({ location: await realpath(input.workspace), agent: input.agent }, pin);
}
