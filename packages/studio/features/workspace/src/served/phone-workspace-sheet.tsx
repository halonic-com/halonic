import { Button, SheetFrame, StatusChip } from "@halonicjs/studio-kit";
import { letterMark } from "@halonicjs/studio-shell";
import { useEffect, useState } from "react";
import type { LoadServedWorkspace, ServedWorkspace } from "./served-workspace.ts";

/** Under the one row (microcopy 4.2): a phone never opens another workspace itself. */
export const openElsewhereLine = "To open another workspace, open it on your computer.";

/** What the sheet shows while it asks, and when the computer doesn't answer (microcopy 4.2). */
export const loadingText = "Loading workspaces";
export const notLoadedTitle = "Couldn't load workspaces";
export const notLoadedLine = "Halonic on your computer isn't answering.";

/** Props for {@link PhoneWorkspaceSheet}. */
export interface PhoneWorkspaceSheetProps {
  readonly load: LoadServedWorkspace;
  readonly onClose: () => void;
  readonly returnFocus?: () => HTMLElement | null;
}

type Answer =
  | { readonly kind: "loading" }
  | { readonly kind: "shown"; readonly workspace: ServedWorkspace }
  | { readonly kind: "failed" };

/**
 * The phone's workspace picker sheet (flow-workspace 2.5, component specs 15.3): the one
 * workspace the computer serves, with the Sample tag on a sample, and the line that says where
 * to open another. It asks the computer each time it opens, so it never shows a stale row.
 * Loading and "Couldn't load workspaces" have their own states, with **Try again**.
 *
 * @example
 * <PhoneWorkspaceSheet load={load} onClose={() => setOpen(false)} />
 */
export function PhoneWorkspaceSheet({ load, onClose, returnFocus }: PhoneWorkspaceSheetProps) {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer>({ kind: "loading" });
  useEffect(() => {
    let current = true;
    setAnswer({ kind: "loading" });
    load().then(
      (workspace) => current && setAnswer({ kind: "shown", workspace }),
      () => current && setAnswer({ kind: "failed" }),
    );
    return () => {
      current = false;
    };
  }, [load, attempt]);
  return (
    <SheetFrame
      title="Workspace"
      onClose={onClose}
      onCancel={onClose}
      {...(returnFocus === undefined ? {} : { returnFocus })}
    >
      <SheetBody answer={answer} onTryAgain={() => setAttempt(attempt + 1)} />
    </SheetFrame>
  );
}

function WorkspaceRow({ workspace }: { readonly workspace: ServedWorkspace }) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-border px-4 py-2">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-body-strong text-accent-text"
      >
        {letterMark(workspace.name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-strong text-fg">{workspace.name}</span>
        <span className="truncate text-small text-fg-muted">{workspace.folder}</span>
      </span>
      {workspace.sample ? <StatusChip tone="outline">Sample</StatusChip> : null}
    </div>
  );
}

function SheetBody({
  answer,
  onTryAgain,
}: {
  readonly answer: Answer;
  readonly onTryAgain: () => void;
}) {
  if (answer.kind === "loading") {
    return (
      <p role="status" className="px-4 py-3 text-body text-fg-muted">
        {loadingText}
      </p>
    );
  }
  if (answer.kind === "failed") {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 px-4 py-3">
        <p className="text-body-strong text-fg">{notLoadedTitle}</p>
        <p className="text-body text-fg-muted">{notLoadedLine}</p>
        <Button variant="secondary" onClick={onTryAgain}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <>
      <WorkspaceRow workspace={answer.workspace} />
      <p className="px-4 py-3 text-small text-fg-muted">{openElsewhereLine}</p>
    </>
  );
}
