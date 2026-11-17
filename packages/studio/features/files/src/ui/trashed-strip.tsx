import { Callout } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import { filesWords } from "../files-words.ts";

/** What the strip says and does. */
export interface TrashedStripProps {
  /** Reads the strip to a screen reader once, when it shows. */
  readonly announce: (text: string) => void;
  readonly onUndo: () => void | Promise<void>;
}

/**
 * The strip above the greyed, read-only editor of a file that was moved to the trash. Its Undo
 * takes focus when the strip shows, because the row the user pressed Delete on is gone
 * (requirement `files.ui.delete-file`).
 */
export function TrashedStrip({ announce, onUndo }: TrashedStripProps) {
  const root = useRef<HTMLDivElement>(null);
  const said = useRef(announce);
  said.current = announce;
  useEffect(() => {
    said.current(filesWords.trashed);
    root.current?.querySelector("button")?.focus();
  }, []);
  return (
    <div ref={root} role="status" className="px-4 pb-2">
      <Callout tone="warning" action={[{ label: filesWords.undo, onClick: onUndo }]}>
        {filesWords.trashed}
      </Callout>
    </div>
  );
}
