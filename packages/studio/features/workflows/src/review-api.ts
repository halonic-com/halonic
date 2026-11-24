/**
 * The assistant's changes to review in a workflow's file, as the workflow page's item bar and
 * marks read and decide them (AI changes 1.2, T14 PR 14b). The app provides it over its review
 * service; where it doesn't, the page finds no service and shows no bar.
 */
import { type ItemReviewHost, type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { WorkflowRef } from "./api.ts";

/**
 * The assistant's changes to review in the workspace's workflows: one change per workflow field
 * and per step, as `describeWorkflowChange` names them. `changesIn` rejects like
 * `WorkflowsHost.read`.
 */
export type WorkflowReviewHost = ItemReviewHost<WorkflowRef>;

/** The changes to review in the open workspace's workflows, provided by the app (`workflows.review`). */
export const WorkflowReviewService: ServiceKey<WorkflowReviewHost> =
  serviceKey<WorkflowReviewHost>("workflows.review");
