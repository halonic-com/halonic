import { describeWorkflowChange } from "@halonicjs/app";
import type { WorkflowRef } from "@halonicjs/studio-feature-workflows/api";
import {
  WorkspaceItemReview,
  type WorkspaceItemReviewParts,
} from "../changes/workspace-item-review.ts";

/** What {@link WorkspaceWorkflowReview} needs. */
export type WorkspaceWorkflowReviewParts = Pick<
  WorkspaceItemReviewParts<WorkflowRef, "workflow">,
  "review" | "pathOf"
>;

/**
 * The workflow page's changes to review (`workflows.review`), over the workspace's review service:
 * one change per workflow field and per step, as `describeWorkflowChange` names them, with steps
 * that need each other joined into one change.
 *
 * @example
 * services.provide(WorkflowReviewService, new WorkspaceWorkflowReview({ review, pathOf: (ref) => workflows.filePath(ref) }));
 */
export class WorkspaceWorkflowReview extends WorkspaceItemReview<WorkflowRef, "workflow"> {
  constructor(parts: WorkspaceWorkflowReviewParts) {
    super({ ...parts, kind: "workflow", describe: describeWorkflowChange });
  }
}
