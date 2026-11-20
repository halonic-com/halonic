import { Button, WarningIcon } from "@halonicjs/studio-kit";
import { useId, useState } from "react";
import { pageWords } from "./page-words.ts";
import { TrashIcon } from "./trash-icon.tsx";

const words = pageWords.stepCard;

/** Props for {@link RemoveStepButton}. */
export interface RemoveStepButtonProps {
  /** The workflow's first step, which can't go until another is picked. */
  readonly first: boolean;
  /** Removes the step at once, with no confirm; the toast says what went. Absent: no button. */
  readonly onRemove: (() => void) | undefined;
  readonly announce?: ((line: string) => void) | undefined;
}

/**
 * The step card's last field, **Remove step** (flow-workflows 4.6, UX checklist 10.10). On the
 * first step it removes nothing and says why under the button, since a run would have nowhere to
 * start; the line is read out, as there is no toast for it.
 */
export function RemoveStepButton({ first, onRemove, announce }: RemoveStepButtonProps) {
  const noteId = useId();
  const [refused, setRefused] = useState(false);
  if (onRemove === undefined) return null;
  const press = () => {
    if (!first) return onRemove();
    setRefused(true);
    announce?.(words.firstStep);
  };
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="danger-outline"
        size="sm"
        icon={<TrashIcon />}
        {...(refused ? { "aria-describedby": noteId } : {})}
        onClick={press}
      >
        {words.remove}
      </Button>
      {refused && (
        <p id={noteId} className="flex items-start gap-2 text-small text-warning">
          <span className="mt-0.5 size-4 shrink-0">
            <WarningIcon />
          </span>
          {words.firstStep}
        </p>
      )}
    </div>
  );
}
