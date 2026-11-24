import type {
  CodeEditor,
  EditorReviewActions,
  EditorReviewPart,
} from "@halonicjs/studio-code-editor";
import type { ToastStore } from "@halonicjs/studio-kit";
import {
  errorReasonFor,
  ItemReviewBar,
  type ItemReviewBusy,
  itemReviewWords,
  positionWithin,
  type ServiceLookup,
} from "@halonicjs/studio-shell";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { fileName } from "../file-item.ts";
import {
  type FileReview,
  type FileReviewDecision,
  FileReviewService,
  type FileReviewTarget,
} from "../file-review.ts";
import { filesWords } from "../files-words.ts";

/** What {@link useFileReview} needs from the file's tab. */
export interface FileReviewParts {
  readonly services: ServiceLookup;
  readonly path: string;
  /** The tab's editor, once it is open. */
  readonly editor: RefObject<CodeEditor | undefined>;
  readonly toasts: ToastStore | null;
  /** Opens Compare, for a decision held because the file changed outside Halonic. */
  readonly onCompare: () => void;
}

/** The assistant's changes to review in a file's tab. */
export interface FileReviewView {
  /** For the editor's `review` option, the same for the tab's life; absent without the service. */
  readonly actions: EditorReviewActions | undefined;
  /** The parts to mark now, for an editor that opens after they were read. */
  readonly parts: () => readonly EditorReviewPart[];
  /** The bar above the editor, or nothing without changes to review. */
  readonly bar: ReactNode;
}

/** The editor's marks for a review: the only part of a file the assistant created deletes it. */
function editorPartsOf(review: FileReview | null): readonly EditorReviewPart[] {
  if (review === null) return [];
  const deletesFile = review.created && review.parts.length === 1;
  return review.parts.map((part) => ({ ...part, deletesFile }));
}

/**
 * The assistant's changes to review in a file (AI changes 1.2, "In a file"): the editor marks each
 * part with its own Accept and Reject, and the bar above it steps through them and offers Accept
 * file and Reject file. Each decision says what it did in a toast with Undo (AI changes 1.3).
 */
export function useFileReview(parts: FileReviewParts): FileReviewView {
  const { services, path, editor, toasts, onCompare } = parts;
  const host = services.find(FileReviewService);
  const [review, setReview] = useState<FileReview | null>(null);
  const [round, setRound] = useState(0);
  const [position, setPosition] = useState(0);
  const [busy, setBusy] = useState<ItemReviewBusy | undefined>();
  // Set when a decision found the file changed outside Halonic; it waits for Compare.
  const [held, setHeld] = useState(false);
  const latest = useRef<FileReview | null>(null);
  latest.current = review;

  useEffect(() => {
    if (host === undefined) return;
    // Only the newest read counts: an older, slower answer would show parts that are out of date.
    let stopped = false;
    let reads = 0;
    const read = () => {
      const mine = ++reads;
      const current = () => !stopped && mine === reads;
      return host.changesIn(path).then(
        (found) => {
          if (!current()) return;
          setReview(found);
          setPosition((was) => positionWithin(was, found?.parts.length ?? 0));
        },
        // The file's own read says why it can't be read; the tab shows that, so no bar here.
        () => current() && setReview(null),
      );
    };
    void read();
    const unsubscribe = host.subscribe(path, () => {
      setHeld(false);
      void read();
    });
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, [host, path, round]);

  useEffect(() => {
    editor.current?.setReviewParts(editorPartsOf(review));
  }, [editor, review]);

  function failed(error: unknown): void {
    toasts?.show({ tone: "danger", title: errorReasonFor(error), sticky: true });
  }

  async function undo(decision: Extract<FileReviewDecision, { status: "done" }>): Promise<void> {
    try {
      if ((await decision.undo()) === "held") setHeld(true);
    } catch (error) {
      failed(error);
    }
  }

  /** Says what a decision did: a toast with Undo, Compare in the bar, or the parts read again. */
  function answered(outcome: FileReviewDecision, decision: "accept" | "reject", count: number) {
    if (outcome.status === "held") {
      setHeld(true);
      return;
    }
    if (outcome.status === "stale") {
      // Read before the file changed: show what is to review now, and decide nothing.
      setRound((was) => was + 1);
      return;
    }
    toasts?.show({
      tone: "success",
      title: filesWords.decided(decision, count, fileName(path)),
      action: { label: filesWords.undo, onClick: () => void undo(outcome) },
    });
  }

  async function decide(target: FileReviewTarget, decision: "accept" | "reject"): Promise<void> {
    if (host === undefined) return;
    const count = target.kind === "part" ? 1 : (latest.current?.parts.length ?? 0);
    try {
      const outcome = await (decision === "accept" ? host.accept(target) : host.reject(target));
      answered(outcome, decision, count);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(undefined);
    }
  }

  // The editor keeps the actions it was opened with, so they reach the newest `decide` through a ref.
  const decideRef = useRef(decide);
  decideRef.current = decide;
  const actions = useMemo<EditorReviewActions | undefined>(
    () =>
      host === undefined
        ? undefined
        : {
            accept: itemReviewWords.accept,
            reject: itemReviewWords.reject,
            rejectAndDelete: itemReviewWords.rejectAndDelete,
            partLabel: itemReviewWords.spokenPosition,
            onDecide: (part, decision) => {
              const shown = latest.current;
              if (shown !== null)
                void decideRef.current({ kind: "part", review: shown, part }, decision);
            },
          },
    [host],
  );

  const deciding = (decision: "accept" | "reject") => () => {
    setBusy(decision === "accept" ? "accept-all" : "reject-all");
    void decide({ kind: "file", path }, decision);
  };
  const bar =
    review === null ? null : (
      <ItemReviewBar
        count={review.parts.length}
        position={position}
        onStep={(to) => {
          setPosition(to);
          editor.current?.goToReviewPart(to);
        }}
        onAcceptAll={deciding("accept")}
        onRejectAll={deciding("reject")}
        busy={busy}
        heldOutside={held ? { onCompare } : undefined}
        labels={{
          acceptAll: filesWords.acceptFile,
          rejectAll: review.created ? itemReviewWords.rejectAndDelete : filesWords.rejectFile,
        }}
      />
    );
  return { actions, parts: () => editorPartsOf(latest.current), bar };
}
