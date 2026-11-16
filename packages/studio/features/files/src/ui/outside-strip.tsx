import { Button } from "@halonicjs/studio-kit";
import { fileName } from "../file-item.ts";
import type { OutsideChange } from "../files-host.ts";
import { filesWords } from "../files-words.ts";

/** What the strip's buttons do. */
export interface OutsideStripProps {
  readonly path: string;
  readonly change: OutsideChange;
  readonly onCompare: () => void;
  readonly onKeepMine: () => void | Promise<void>;
  readonly onClose: () => void | Promise<void>;
}

/**
 * The strip above the editor of a file with unsaved changes that changed or was deleted outside
 * Halonic. It is a status message, never a pop-up, and it sits still while the user keeps typing
 * (requirement `files.ui.outside-strip`).
 */
export function OutsideStrip({ path, change, onCompare, onKeepMine, onClose }: OutsideStripProps) {
  const name = fileName(path);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 border-b border-border bg-warning-soft px-4 py-1 text-small text-fg"
    >
      <span className="min-w-0 wrap-anywhere">
        {change === "changed" ? filesWords.changedOutside(name) : filesWords.deletedOutside(name)}
      </span>
      {change === "changed" ? (
        <Button variant="ghost" size="sm" onClick={onCompare}>
          {filesWords.compare}
        </Button>
      ) : (
        <>
          <Button variant="ghost" size="sm" onClick={onKeepMine}>
            {filesWords.keepMine}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {filesWords.close}
          </Button>
        </>
      )}
    </div>
  );
}
