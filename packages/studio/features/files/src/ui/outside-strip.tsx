import { Callout } from "@halonicjs/studio-kit";
import { fileName } from "../file-item.ts";
import type { OutsideChange } from "../files-host.ts";
import { filesWords } from "../files-words.ts";

/** What the strip's buttons do. */
export interface OutsideStripProps {
  readonly path: string;
  readonly change: OutsideChange;
  readonly onCompare: () => void;
  readonly onKeepMine: () => void | Promise<void>;
  readonly onLoadTheirs: () => void | Promise<void>;
  readonly onClose: () => void | Promise<void>;
}

/**
 * The strip above the editor of a file with unsaved changes that changed or was deleted outside
 * Halonic. It is a status message, never a pop-up, and it sits still while the user keeps typing
 * (requirement `files.ui.outside-strip`).
 */
export function OutsideStrip({
  path,
  change,
  onCompare,
  onKeepMine,
  onLoadTheirs,
  onClose,
}: OutsideStripProps) {
  const name = fileName(path);
  const keepMine = { label: filesWords.keepMine, onClick: onKeepMine };
  return (
    <div role="status" className="px-4 pb-2">
      <Callout
        tone="warning"
        action={
          change === "changed"
            ? [
                keepMine,
                { label: filesWords.loadTheirs, onClick: onLoadTheirs },
                { label: filesWords.compare, onClick: onCompare },
              ]
            : [keepMine, { label: filesWords.close, onClick: onClose }]
        }
      >
        <em>{name}</em>
        {change === "changed" ? filesWords.changedOutside : filesWords.deletedOutside}
      </Callout>
    </div>
  );
}
