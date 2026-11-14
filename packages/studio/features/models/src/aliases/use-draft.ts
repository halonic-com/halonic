import { useEffect, useState } from "react";

/**
 * The text of a field while it is edited. It starts from `saved` and starts over whenever `saved`
 * changes (an undo, another editor), so a change to one field never resets another that is being
 * typed in.
 */
export function useDraft(saved: string): [string, (text: string) => void] {
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  return [draft, setDraft];
}
