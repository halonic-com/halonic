import { describeAgentChange } from "@halonicjs/app";
import type { AgentRef } from "@halonicjs/studio-feature-agents/api";
import {
  WorkspaceItemReview,
  type WorkspaceItemReviewParts,
} from "../changes/workspace-item-review.ts";

/** What {@link WorkspaceAgentReview} needs. */
export type WorkspaceAgentReviewParts = Pick<
  WorkspaceItemReviewParts<AgentRef, "agent">,
  "review" | "pathOf"
>;

/**
 * The agents page's changes to review (`agents.review`), over the workspace's review service: one
 * change per field and per agent step, as `describeAgentChange` names them.
 *
 * @example
 * services.provide(AgentReviewService, new WorkspaceAgentReview({ review, pathOf: (ref) => agents.filePath(ref) }));
 */
export class WorkspaceAgentReview extends WorkspaceItemReview<AgentRef, "agent"> {
  constructor(parts: WorkspaceAgentReviewParts) {
    super({ ...parts, kind: "agent", describe: describeAgentChange });
  }
}
