/**
 * The assistant's changes to review in an agent's file, as the agent page's item bar and marks
 * read and decide them (AI changes 1.2, T14 PR 14a). The app provides it over its review service;
 * where it doesn't, the page finds no service and shows no bar.
 */
import {
  type ItemChangeToReview,
  type ItemReview,
  type ItemReviewDecision,
  type ItemReviewHost,
  type ItemReviewTarget,
  type ServiceKey,
  serviceKey,
} from "@halonicjs/studio-shell";
import type { AgentRef } from "./api.ts";

/** One change the assistant made to an agent: one field, or one agent step. */
export type AgentChangeToReview = ItemChangeToReview;

/** The assistant's changes to review in one agent's file, in the order of its fields, then its agent steps. */
export type AgentReview = ItemReview;

/** What one Accept or Reject on the agent page did. */
export type AgentReviewDecision = ItemReviewDecision;

/** What a decision on the agent page covers: one change of a review, or every change in the file. */
export type AgentReviewTarget = ItemReviewTarget;

/** The assistant's changes to review in the workspace's agents. `changesIn` rejects like `AgentsHost.read`. */
export type AgentReviewHost = ItemReviewHost<AgentRef>;

/** The changes to review in the open workspace's agents, provided by the app (`agents.review`). */
export const AgentReviewService: ServiceKey<AgentReviewHost> =
  serviceKey<AgentReviewHost>("agents.review");
