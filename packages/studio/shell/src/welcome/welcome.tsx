import { Button, inlineLinkClasses } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import { copyDetailsWords } from "../errors/copy-details-words.ts";
import { useCopyDetails } from "../page/copy-details.ts";
import type { WelcomeOpenProblem } from "./cant-open.ts";

/** Props for {@link Welcome}. */
export interface WelcomeProps {
  /**
   * Shows the folder picker and opens the folder picked. Resolves with the problem when it
   * couldn't, else with `undefined`: opened, or the picker was cancelled.
   */
  readonly onOpenFolder: () => Promise<WelcomeOpenProblem | undefined>;
}

/**
 * The window while no workspace is open (`shell.welcome.open-action`, microcopy 3.2): "Halonic
 * Studio", what a workspace is, and **Open folder**, the one primary button, centred with no
 * sidebar and no tabs. While the folder opens the button reads "Opening…" and is busy: it keeps
 * focus and ignores presses. A folder that fails to open says why under the text in the danger
 * colour, and the button works again (`shell.welcome.cant-open`); a reason Halonic can't explain
 * comes with **Copy details**. Cancelling the picker changes
 * nothing. Focus starts on **Open folder** (accessibility pass 1.3).
 *
 * @example
 * <Welcome onOpenFolder={openFolder} />
 */
export function Welcome({ onOpenFolder }: WelcomeProps) {
  const [opening, setOpening] = useState(false);
  const [problem, setProblem] = useState<WelcomeOpenProblem | undefined>(undefined);
  const openButton = useRef<HTMLButtonElement>(null);
  const copyDetails = useCopyDetails();
  useEffect(() => {
    openButton.current?.focus();
  }, []);

  const open = async () => {
    setOpening(true);
    setProblem(undefined);
    try {
      setProblem(await onOpenFolder());
    } finally {
      setOpening(false);
    }
  };

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
          busy={opening}
          busyLabel="Opening…"
          onClick={open}
        >
          Open folder
        </Button>
        <p role="alert" className="text-body text-danger empty:hidden">
          {problem === undefined ? null : `Can't open ${problem.folder}: ${problem.reason}`}
        </p>
        {problem?.details === undefined ? null : (
          <button
            type="button"
            className={`text-body ${inlineLinkClasses}`}
            onClick={() => copyDetails(problem.details ?? "")}
          >
            {copyDetailsWords.label}
          </button>
        )}
      </div>
    </div>
  );
}
