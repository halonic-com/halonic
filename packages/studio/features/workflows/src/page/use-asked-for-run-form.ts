import { useEffect, useRef } from "react";

/**
 * Calls `open` once for each ask for the Run form (`runFormAsked`, which counts up), but only once
 * none of `reads` (the workflow, its problems, the files' refusal) is still loading: opened before
 * then, the form could show for a run the files go on to refuse. An ask that comes while a run
 * can't start is used up, as a press of Run then does nothing.
 */
export function useAskedForRunForm(
  runFormAsked: number | undefined,
  reads: readonly { readonly kind: string }[],
  open: () => void,
) {
  const answered = useRef<number | undefined>(undefined);
  const read = reads.every((one) => one.kind !== "loading");
  useEffect(() => {
    if (runFormAsked === undefined || runFormAsked === answered.current || !read) return;
    answered.current = runFormAsked;
    open();
  });
}
