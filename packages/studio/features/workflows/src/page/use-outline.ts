import { useEffect, useRef, useState } from "react";
import { pageWords } from "./page-words.ts";
import type { WorkflowLoad } from "./use-workflow.ts";

/**
 * The steps the page outlines (`workflows.page.outline-steps`, flow-workflows 9): those it was
 * opened with (`outline`), and again each time an open page is asked for them (`asked` changes
 * while `outline` is given; then `onAsked` runs, during the render, as `useAskedForTests` does).
 * `clear` drops the outline, for a picked step or a press on the canvas's background.
 *
 * Each ask is read once to screen readers when the workflow is there, "2 steps use Sorter: triage,
 * draft", if the outlined steps that are still in the file all run one agent.
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
  const read = useRef<number | undefined>(undefined);
  const workflow = load.kind === "ready" ? load.value : undefined;
  useEffect(() => {
    if (workflow === undefined || shown.ids === undefined || read.current === shown.n) return;
    read.current = shown.n;
    const ids = shown.ids;
    const steps = workflow.steps.filter((step) => ids.includes(step.id));
    const agent = steps[0]?.agent;
    if (agent === undefined || steps.some((step) => step.agent !== agent)) return;
    const name = workflow.agents?.find((one) => one.id === agent)?.name ?? agent;
    announce?.(
      pageWords.outlined(
        steps.map((step) => step.id),
        name,
      ),
    );
  }, [workflow, shown, announce]);
  return {
    outlined: shown.ids,
    clear: () => setShown((now) => (now.ids === undefined ? now : { ids: undefined, n: now.n })),
  };
}
