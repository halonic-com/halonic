import { useToastStore } from "@halonicjs/studio-kit";
import { type ChangeMarkBusy, ItemReviewBar, positionWithin } from "@halonicjs/studio-shell";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { AgentRef } from "../api.ts";
import { pageWords } from "../page/page-words.ts";
import type {
  AgentChangeToReview,
  AgentReview,
  AgentReviewDecision,
  AgentReviewHost,
  AgentReviewTarget,
} from "../review-api.ts";
import { agentReviewWords as words } from "./agent-review-words.ts";
import type { ReviewMarksValue } from "./review-marks.tsx";

/** What {@link useAgentReview} needs. */
export interface AgentReviewParts {
  /** The app's changes to review; without it the page has no bar and no marks. */
  readonly host: AgentReviewHost | undefined;
  readonly agent: AgentRef;
  /** The agent's name, for the toasts. */
  readonly name: string;
  /** Opens the change's page and moves the focus to its mark, for Previous and Next. */
  readonly goTo: (change: AgentChangeToReview) => void;
  /** Opens the agent's file, where Files offers Compare (review panel note 4). */
  readonly openFile?: ((path: string) => void) | undefined;
  readonly announce?: ((text: string, politeness?: "polite" | "assertive") => void) | undefined;
}

/** The agent page's changes to review, from {@link useAgentReview}. */
export interface AgentReviewState {
  /** The item bar for the line under the header; nothing without changes to review. */
  readonly bar: ReactNode;
  /** For `ReviewMarksContext`; `null` without changes to review. */
  readonly marks: ReviewMarksValue | null;
  /** Called as an edit of the person's is saved: an edit inside a change accepts it (note 2). */
  readonly editing: () => void;
}

type Busy = { readonly id: string; readonly verb: ChangeMarkBusy };

/**
 * The assistant's changes to the agent, as the page's item bar and marks show and decide them
 * (AI changes 1.2 and 1.3). Each Accept or Reject, and Accept all or Reject all, is one decision
 * with a toast that has Undo; the review is read again each time the app says it changed.
 */
export function useAgentReview(parts: AgentReviewParts): AgentReviewState {
  const { host, agent, name, goTo, openFile } = parts;
  const { hubId, id } = agent;
  const toasts = useToastStore();
  const [review, setReview] = useState<AgentReview | null>(null);
  const [position, setPosition] = useState(0);
  const [busy, setBusy] = useState<Busy>();
  const [held, setHeld] = useState(false);
  // How many changes there were as the person's edit was saved; a later read with fewer says so.
  const countBeforeEdit = useRef<number>(undefined);
  const shown = useRef(review);
  shown.current = review;
  const announce = useRef(parts.announce);
  announce.current = parts.announce;
  const reads = useRef(0);

  const read = useCallback(async () => {
    if (host === undefined) return;
    const asked = ++reads.current;
    try {
      const found = await host.changesIn({ hubId, id });
      // Only the newest read counts: an older one may answer after it.
      if (asked !== reads.current) return;
      const count = found?.changes.length ?? 0;
      const before = countBeforeEdit.current;
      countBeforeEdit.current = undefined;
      if (before !== undefined && count < before)
        announce.current?.(words.acceptedByEdit, "polite");
      setReview(found);
      setHeld(false);
      setPosition((at) => positionWithin(at, count));
    } catch (error) {
      console.error("Reading the agent's changes to review", error);
    }
  }, [host, hubId, id]);

  useEffect(() => {
    if (host === undefined) return;
    void read();
    return host.subscribe({ hubId, id }, () => void read());
  }, [host, hubId, id, read]);

  const failed = (error: unknown) =>
    toasts?.show({
      tone: "danger",
      title: pageWords.couldntSave(error instanceof Error ? error.message : String(error)),
    });

  const undo = async (back: () => Promise<"done" | "held">) => {
    try {
      if ((await back()) === "held") setHeld(true);
    } catch (error) {
      failed(error);
    }
  };

  const settle = (outcome: AgentReviewDecision, verb: ChangeMarkBusy, count: number) => {
    if (outcome.status === "done") {
      toasts?.show({
        tone: "success",
        title: words.decided(verb, count, name),
        action: { label: words.undo, onClick: () => void undo(outcome.undo) },
      });
    } else if (outcome.status === "held") {
      setHeld(true);
    } else if (outcome.status === "stale") {
      // Note 1: the review was read before the file changed; show the new one quietly.
      void read();
    } else {
      toasts?.show({ tone: "info", title: words.cantSeparate });
    }
  };

  const decide = async (target: AgentReviewTarget, verb: ChangeMarkBusy, busyOn: Busy["id"]) => {
    if (host === undefined || busy !== undefined) return;
    countBeforeEdit.current = undefined;
    setBusy({ id: busyOn, verb });
    const count = target.kind === "all" ? (review?.changes.length ?? 0) : 1;
    try {
      settle(
        verb === "accept" ? await host.accept(target) : await host.reject(target),
        verb,
        count,
      );
    } catch (error) {
      failed(error);
    } finally {
      setBusy(undefined);
    }
  };

  if (review === null) {
    return { bar: null, marks: null, editing: () => {} };
  }
  const decideAll = (verb: ChangeMarkBusy) =>
    void decide({ kind: "all", path: review.path }, verb, "all");
  const bar = (
    <ItemReviewBar
      count={review.changes.length}
      position={position}
      onStep={(next) => {
        setPosition(next);
        const change = review.changes[next];
        if (change !== undefined) goTo(change);
      }}
      onAcceptAll={() => decideAll("accept")}
      onRejectAll={() => decideAll("reject")}
      busy={busy?.id === "all" ? busyAll(busy.verb) : undefined}
      heldOutside={held ? { onCompare: () => openFile?.(review.path) } : undefined}
    />
  );
  return {
    bar,
    marks: {
      agent,
      review,
      held,
      busy,
      decide: (change, verb) => void decide({ kind: "change", review, change }, verb, change.id),
    },
    editing: () => {
      countBeforeEdit.current = shown.current?.changes.length;
    },
  };
}

const busyAll = (verb: ChangeMarkBusy) => (verb === "accept" ? "accept-all" : "reject-all");
