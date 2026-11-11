import { Button, inlineLinkClasses } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { copyDetailsWords } from "../errors/copy-details-words.ts";
import { useCopyDetails } from "../page/copy-details.ts";
import type { WelcomeOpenProblem } from "./cant-open.ts";
import {
  WELCOME_RECENT_ROWS,
  WelcomeRecent,
  type WelcomeRecentWorkspace,
} from "./welcome-recent.tsx";

/** The Welcome screen's Recent list and what its rows do. */
export interface WelcomeRecentList {
  /** The workspaces remembered on this device, most recent first. */
  readonly workspaces: readonly WelcomeRecentWorkspace[];
  /** Opens the workspace in that folder; resolves with the problem when it couldn't. */
  readonly onOpen: (location: string) => Promise<WelcomeOpenProblem | undefined>;
  /** Forgets the workspace in that folder, for **Remove from Recent**. */
  readonly onRemove: (location: string) => void;
}

/** Props for {@link Welcome}. */
export interface WelcomeProps {
  /**
   * Shows the folder picker and opens the folder picked. Resolves with the problem when it
   * couldn't, else with `undefined`: opened, or the picker was cancelled.
   */
  readonly onOpenFolder: () => Promise<WelcomeOpenProblem | undefined>;
  /** The workspaces remembered on this device; without it, or while it's empty, none show. */
  readonly recent?: WelcomeRecentList | undefined;
}

/** What failed to open, and whether a Recent row asked for it. */
interface ShownProblem {
  readonly problem: WelcomeOpenProblem;
  readonly fromRecent: boolean;
}

/** What is opening: the picked folder, or the Recent row in that folder. */
type Opening = { readonly from: "picker" } | { readonly from: "recent"; readonly location: string };

/**
 * The window while no workspace is open (`shell.welcome.open-action`, microcopy 3.2): "Halonic
 * Studio", what a workspace is, and **Open folder**, the one primary button, centred with no
 * sidebar and no tabs. While the folder opens the button reads "Opening…" and is busy: it keeps
 * focus and ignores presses. A folder that fails to open says why under the text in the danger
 * colour, and the button works again (`shell.welcome.cant-open`); a reason Halonic can't explain
 * comes with **Copy details**. Cancelling the picker changes
 * nothing. Focus starts on **Open folder** (accessibility pass 1.3).
 *
 * Under the button, **Recent** lists up to five remembered workspaces, and one press opens one
 * (states-flow-map W2). A row whose folder is gone says so on the same line with
 * **Remove from Recent**; the row stays until it's removed, and focus then goes to the next row,
 * else **Open folder** (W7). One folder opens at a time: presses meanwhile are ignored.
 *
 * @example
 * <Welcome onOpenFolder={openFolder} recent={{ workspaces, onOpen, onRemove }} />
 */
export function Welcome({ onOpenFolder, recent }: WelcomeProps) {
  const [opening, setOpening] = useState<Opening | undefined>(undefined);
  const [shownProblem, setShownProblem] = useState<ShownProblem | undefined>(undefined);
  /** Where focus goes once a removed row is gone: a row's location, or `null` for Open folder. */
  const [focusAfterRemove, setFocusAfterRemove] = useState<string | null | undefined>(undefined);
  const openButton = useRef<HTMLButtonElement>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const copyDetails = useCopyDetails();
  useEffect(() => {
    openButton.current?.focus();
  }, []);
  useEffect(() => {
    if (focusAfterRemove === undefined) {
      return;
    }
    const row = focusAfterRemove === null ? undefined : rows.current.get(focusAfterRemove);
    (row ?? openButton.current)?.focus();
    setFocusAfterRemove(undefined);
  }, [focusAfterRemove]);
  const rowRef = useCallback(
    (location: string) => (button: HTMLButtonElement | null) => {
      if (button === null) {
        rows.current.delete(location);
      } else {
        rows.current.set(location, button);
      }
    },
    [],
  );

  const run = async (what: Opening, open: () => Promise<WelcomeOpenProblem | undefined>) => {
    if (opening !== undefined) {
      return;
    }
    setOpening(what);
    setShownProblem(undefined);
    try {
      const problem = await open();
      setShownProblem(
        problem === undefined ? undefined : { problem, fromRecent: what.from === "recent" },
      );
    } finally {
      setOpening(undefined);
    }
  };

  const remove = (location: string) => {
    if (recent === undefined) {
      return;
    }
    const shown = recent.workspaces.slice(0, WELCOME_RECENT_ROWS);
    const next = shown[shown.findIndex((workspace) => workspace.location === location) + 1];
    setShownProblem(undefined);
    recent.onRemove(location);
    setFocusAfterRemove(next?.location ?? null);
  };

  const problem = shownProblem?.problem;
  const offersRemove =
    shownProblem?.fromRecent === true && problem?.kind === "not_found" && recent !== undefined;

  return (
    <div className="grid h-full place-items-center overflow-auto p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-title">Halonic Studio</h1>
          <p className="text-body text-fg-muted">
            Your workspace is a folder of plain files.
            <br />
            Local first, private, and yours.
          </p>
        </div>
        <Button
          ref={openButton}
          variant="primary"
          busy={opening?.from === "picker"}
          busyLabel="Opening…"
          onClick={() => run({ from: "picker" }, onOpenFolder)}
        >
          Open folder
        </Button>
        <p role="alert" className="text-body text-danger empty:hidden">
          {problem === undefined ? null : `Can't open ${problem.folder}: ${problem.reason}`}
        </p>
        {offersRemove ? (
          <button
            type="button"
            className={`text-body ${inlineLinkClasses}`}
            onClick={() => remove(problem.folder)}
          >
            {removeFromRecentLabel}
          </button>
        ) : null}
        {problem?.details === undefined ? null : (
          <button
            type="button"
            className={`text-body ${inlineLinkClasses}`}
            onClick={() => copyDetails(problem.details ?? "")}
          >
            {copyDetailsWords.label}
          </button>
        )}
        {recent === undefined ? null : (
          <WelcomeRecent
            workspaces={recent.workspaces}
            opening={opening?.from === "recent" ? opening.location : undefined}
            onOpen={(location) => run({ from: "recent", location }, () => recent.onOpen(location))}
            rowRef={rowRef}
          />
        )}
      </div>
    </div>
  );
}

/** The link that drops a Recent row whose folder is gone (microcopy 3.2). */
export const removeFromRecentLabel = "Remove from Recent";
