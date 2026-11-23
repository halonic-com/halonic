import {
  type ChangeLine,
  describeAgentChange,
  type FileReview,
  partValueIn,
  type ReviewOutcome,
  type ReviewService,
  type ReviewTarget,
} from "@halonicjs/app";
import { type Agent, parseFile } from "@halonicjs/format";
import type { ExpectedContent } from "@halonicjs/ports";
import { applyLineChanges } from "@halonicjs/std";
import type {
  AgentChangeToReview,
  AgentRef,
  AgentReview,
  AgentReviewDecision,
  AgentReviewHost,
  AgentReviewTarget,
} from "@halonicjs/studio-feature-agents/api";
import { placeOf } from "@halonicjs/workspace";

/** What {@link WorkspaceAgentReview} needs. */
export interface WorkspaceAgentReviewParts {
  /** The workspace's review service (`workspace.review`). */
  readonly review: Pick<
    ReviewService,
    "changesIn" | "accept" | "reject" | "restore" | "onDidChange"
  >;
  /** The agent's file from the workspace folder: `AgentsHost.filePath`. */
  readonly pathOf: (ref: AgentRef) => Promise<string>;
}

/**
 * The agents page's changes to review (`agents.review`), over the workspace's review service: one
 * change per field and per agent step, as `describeAgentChange` names them, from the file with
 * every open change rejected (the baseline) to the saved file.
 *
 * @example
 * services.provide(AgentReviewService, new WorkspaceAgentReview({ review, pathOf: (ref) => agents.filePath(ref) }));
 */
export class WorkspaceAgentReview implements AgentReviewHost {
  readonly #parts: WorkspaceAgentReviewParts;

  constructor(parts: WorkspaceAgentReviewParts) {
    this.#parts = parts;
  }

  async changesIn(ref: AgentRef): Promise<AgentReview | null> {
    const path = await this.#parts.pathOf(ref);
    const found = await this.#parts.review.changesIn(path);
    return found === null ? null : agentReviewOf(found);
  }

  accept(target: AgentReviewTarget): Promise<AgentReviewDecision> {
    return this.#decide(target, (review) => this.#parts.review.accept(review));
  }

  reject(target: AgentReviewTarget): Promise<AgentReviewDecision> {
    return this.#decide(target, (review) => this.#parts.review.reject(review));
  }

  subscribe(ref: AgentRef, listener: () => void): () => void {
    let path: string | undefined;
    // Until the path is known (or when it can't be read), every change counts, so none is missed:
    // reading again once too often costs nothing.
    this.#parts.pathOf(ref).then(
      (found) => {
        path = found;
      },
      () => {},
    );
    return this.#parts.review.onDidChange((paths) => {
      if (path === undefined || paths.includes(path)) listener();
    });
  }

  async #decide(
    target: AgentReviewTarget,
    decide: (target: ReviewTarget) => Promise<ReviewOutcome>,
  ): Promise<AgentReviewDecision> {
    const reviewTarget = reviewTargetOf(target);
    const outcome = await decide(reviewTarget);
    if (outcome.status !== "done") return { status: outcome.status };
    if (outcome.held.includes(reviewTarget.path)) return { status: "held" };
    const { step } = outcome;
    return {
      status: "done",
      undo: async () => {
        const undone = await this.#parts.review.restore(step, "before");
        return undone.status === "done" && undone.held.length > 0 ? "held" : "done";
      },
    };
  }
}

/**
 * The service's target for a decision. A review that is decided as a whole, and Accept all or
 * Reject all, cover the file; any other change covers its own parts.
 */
function reviewTargetOf(target: AgentReviewTarget): Extract<ReviewTarget, { path: string }> {
  if (target.kind === "all") return { kind: "file", path: target.path };
  const { review, change } = target;
  if (review.whole) return { kind: "file", path: review.path };
  return {
    kind: "change",
    path: review.path,
    parts: change.parts,
    seen: review.seen as ExpectedContent,
  };
}

/** The changes of one file's review, read as an agent before and after. */
function agentReviewOf(found: FileReview): AgentReview {
  const { path, baseline, seen } = found;
  // The parts are the line changes from the baseline to the text they were worked out from.
  const current = found.deleted ? null : applyLineChanges(baseline ?? "", found.parts);
  const before = agentIn(path, baseline);
  const after = agentIn(path, current);
  const lines =
    before === "unreadable" || after === "unreadable" ? [] : describeAgentChange(before, after);
  // Only comments or spacing changed, or a text doesn't read as an agent: one change for the file.
  const whole = baseline === null || current === null || lines.length === 0;
  const changes = whole
    ? [wholeFileChange(baseline, current)]
    : lines.map((line) => changeOf(line, baseline));
  return { path, whole, changes, seen };
}

function changeOf(line: ChangeLine, baseline: string | null): AgentChangeToReview {
  const [first] = line.parts;
  const before = first === undefined ? undefined : partValueIn(baseline, first);
  return {
    id: line.id,
    sentence: line.sentence,
    important: line.important === true,
    parts: line.parts,
    ...(before?.found === true ? { before: { value: before.value } } : {}),
  };
}

/** The one change of a file decided as a whole, in the words `describeFileChange` uses. */
function wholeFileChange(baseline: string | null, current: string | null): AgentChangeToReview {
  return {
    id: "item",
    sentence: wholeFileSentence(baseline, current),
    important: false,
    parts: [],
  };
}

function wholeFileSentence(baseline: string | null, current: string | null): string {
  if (baseline === null) return "New";
  if (current === null) return "Deleted";
  return "Changed";
}

/** The agent a text holds, `undefined` for no text, or `unreadable`. */
function agentIn(path: string, text: string | null): Agent | undefined | "unreadable" {
  if (text === null) return undefined;
  const id = placeOf(path)?.placeId;
  const parsed = parseFile("agent", text, id === undefined ? {} : { id });
  return parsed.ok ? parsed.value.value : "unreadable";
}
