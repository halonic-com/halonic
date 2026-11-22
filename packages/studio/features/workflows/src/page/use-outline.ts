import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowView } from "../api.ts";
import { pageWords } from "./page-words.ts";
import { nameOf, stepNames } from "./step-names.ts";
import type { WorkflowLoad } from "./use-workflow.ts";

/**
 * The steps the page outlines (`workflows.page.outline-steps`, flow-workflows 9): those it was
 * opened with (`outline`), and again each time an open page is asked for them (`asked` changes
 * while `outline` is given; then `onAsked` runs, during the render, as `useAskedForTests` does).
 * `clear` drops the outline, for a picked step or a press on the canvas's background.
 *
 * `line` says why, "2 steps use Sorter: Read the email, draft", if the outlined steps that are
 * still in the file all run one agent; the Flow tab shows it while the outline is on (C618). Each
 * ask also reads it once to screen readers when the workflow is there.
 */
export function useOutline(
  outline: readonly string[] | undefined,
  asked: number,
  load: WorkflowLoad,
  announce: ((line: string) => void) | undefined,
  onAsked: () => void,
) {
  const [shown, setShown] = useState({ ids: outline, n: 0 });
  const ask = outline === undefined ? undefined : asked;
  const [seen, setSeen] = useState(ask);
  if (ask !== seen) {
    setSeen(ask);
    if (ask !== undefined) {
      setShown((now) => ({ ids: outline, n: now.n + 1 }));
      onAsked();
    }
  }
  const workflow = load.kind === "ready" ? load.value : undefined;
  const line = useMemo(
    () => (workflow === undefined ? undefined : outlineLine(workflow, shown.ids)),
    [workflow, shown.ids],
  );
  const read = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (workflow === undefined || shown.ids === undefined || read.current === shown.n) return;
    read.current = shown.n;
    if (line !== undefined) announce?.(line);
  }, [workflow, shown, line, announce]);
  return {
    outlined: shown.ids,
    line,
    clear: () => setShown((now) => (now.ids === undefined ? now : { ids: undefined, n: now.n })),
  };
}

/** Why `ids` are outlined, when those still in the file all run one agent; else `undefined`. */
function outlineLine(workflow: WorkflowView, ids: readonly string[] | undefined) {
  if (ids === undefined) return undefined;
  const steps = workflow.steps.filter((step) => ids.includes(step.id));
  const agent = steps[0]?.agent;
  if (agent === undefined || steps.some((step) => step.agent !== agent)) return undefined;
  const name = workflow.agents?.find((one) => one.id === agent)?.name ?? agent;
  // As the cards read them, and the arrows' announcements do (C595-32, C617-4).
  const names = stepNames(workflow.steps);
  return pageWords.outlined(
    steps.map((step) => nameOf(names, step.id)),
    name,
  );
}
