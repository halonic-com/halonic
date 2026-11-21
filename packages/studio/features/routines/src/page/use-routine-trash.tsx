import { TrashStrip, useToastStore } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { RoutinesHost, RoutineView, TrashedRoutine } from "../api.ts";
import { rowMenuWords } from "../list/list-words.ts";
import { putBackRoutine, trashRoutine } from "../list/trash-routine.ts";
import { pageWords } from "./page-words.ts";
import type { RoutineLoad } from "./use-routine.ts";

/** What {@link useRoutineTrash} gives the page. */
export interface RoutineTrash {
  /** Deletes the routine the page shows, for the ⋮ menu's **Delete**. */
  readonly onDelete: (routine: RoutineView) => void;
  /** The strip with **Undo** that replaces the page once the routine is gone, or `null` while it is there. */
  readonly strip: ReactNode;
}

/**
 * Delete from a routine's own page, as an agent's page does it: no toast, and once the page reads
 * the routine as gone, a strip "This routine was deleted." with **Undo** stands where "isn't in this
 * workspace any more" would, for as long as the page is open (HAL-14241). A routine that went some
 * other way still shows that state. Once the routine is back, by **Undo** or the workspace's own
 * undo (Ctrl Z), the page returns and `onBack` runs after it is drawn, so its title can take the
 * focus.
 */
export function useRoutineTrash(
  host: RoutinesHost,
  load: RoutineLoad,
  onBack: () => void,
): RoutineTrash {
  const toasts = useToastStore();
  // The name and target at Delete: once the routine is gone, the page can't read them.
  const [removed, setRemoved] = useState<{
    trashed: TrashedRoutine;
    name: string;
    targetName: string;
  }>();
  const gone = load.kind === "failed" && load.gone;
  const showStrip = removed !== undefined && gone;
  const stripWasShown = useRef(false);
  const ready = load.kind === "ready";
  useEffect(() => {
    if (showStrip) {
      stripWasShown.current = true;
      return;
    }
    if (!stripWasShown.current || !ready) return;
    stripWasShown.current = false;
    setRemoved(undefined);
    onBack();
  }, [showStrip, ready, onBack]);

  const onDelete = (routine: RoutineView) =>
    void trashRoutine(host, toasts, routine, {
      // Focus goes to Undo, which reads the strip's text as its description: no toast says it too.
      quiet: true,
      onTrashed: (trashed) =>
        setRemoved({ trashed, name: routine.name, targetName: routine.targetName }),
    });
  // The page comes back by itself once the host reads the routine again.
  const onUndo = async () => {
    if (removed !== undefined) await putBackRoutine(removed.trashed, removed.name, toasts);
  };
  // Undo takes focus: the page and its ⋮ button, where focus was, are gone. The strip is the
  // first thing on the page, so it gets 16px above it, like the page's sides.
  const strip = showStrip ? (
    <div className="pt-4">
      <TrashStrip
        text={pageWords.deleted}
        detail={rowMenuWords.movedLine(removed.targetName)}
        undoLabel={rowMenuWords.undo}
        onUndo={onUndo}
        focusUndo
      />
    </div>
  ) : null;
  return { onDelete, strip };
}
