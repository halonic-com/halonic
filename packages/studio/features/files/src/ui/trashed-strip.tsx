import { TrashStrip } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import { filesWords } from "../files-words.ts";

/** What the strip says and does. */
export interface TrashedStripProps {
  /** Reads the strip to a screen reader once, when it shows. */
  readonly announce: (text: string) => void;
  readonly onUndo: () => void | Promise<void>;
}

/**
 * The strip above the greyed, read-only editor of a file that was moved to the trash. It is read
 * to a screen reader once and takes no focus: focus belongs to the tree's next row
 * (requirement `files.ui.delete-file`).
 */
export function TrashedStrip({ announce, onUndo }: TrashedStripProps) {
  const said = useRef(announce);
  said.current = announce;
  useEffect(() => {
    said.current(filesWords.trashed);
  }, []);
  return <TrashStrip text={filesWords.trashed} undoLabel={filesWords.undo} onUndo={onUndo} />;
}
