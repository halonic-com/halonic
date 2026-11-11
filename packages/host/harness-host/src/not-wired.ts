// Stand-ins for what a host doesn't offer yet (requirement
// `harness-host.not-wired`). Each refuses with its own typed error, so a
// caller can tell it from a real failure, and the real one (HAL-6477) can't
// replace it without its tests noticing.

import type { Trash } from "@halonicjs/app";
import type { BridgeApprovals } from "@halonicjs/ports";

/** Thrown by {@link refusingApprovals}: this host can't ask a person yet. */
export class HarnessApprovalsNotWiredError extends Error {
  readonly tool: string;

  constructor(tool: string) {
    super(
      `The agent asked to use ${tool}, which needs a person's OK, but this host can't ask for one yet, so it wasn't run.`,
    );
    this.name = "HarnessApprovalsNotWiredError";
    this.tool = tool;
  }
}

/**
 * Approvals that refuse every request: the agent's call isn't run, and the
 * bridge answers the program with the error's message.
 */
export const refusingApprovals: BridgeApprovals = {
  request: async (request) => {
    throw new HarnessApprovalsNotWiredError(request.tool);
  },
};

/** Thrown by {@link refusingTrash}: this host can't accept a proposal yet. */
export class ProposalAcceptNotWiredError extends Error {
  constructor() {
    super("This host can't accept a run's proposal yet, so no file was moved to the trash.");
    this.name = "ProposalAcceptNotWiredError";
  }
}

/**
 * A trash that refuses to move or restore anything. Only Accept and its
 * Undo use the trash, and a host without Accept never calls it.
 */
export const refusingTrash: Trash = {
  moveToTrash: async () => {
    throw new ProposalAcceptNotWiredError();
  },
  restore: async () => {
    throw new ProposalAcceptNotWiredError();
  },
};
