import { type RefObject, useEffect, useState } from "react";
import type { ChangesList } from "../changes-list.ts";

/**
 * Creating a version closes its dialog, and focus goes back to the Create version button. With
 * nothing left to version that button is gone a moment later, and focus would drop to the page
 * (WCAG 2.4.3). So focus moves on to what the person just made: History's first row, the new
 * version, once the page has read again. When that read failed, the first row isn't the new
 * version, so focus stays where the dialog put it, and the failure's alert says why.
 */
export function useFocusNewVersion(
  list: ChangesList,
  page: RefObject<HTMLElement | null>,
): () => void {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    setPending(false);
    page.current
      ?.querySelector<HTMLElement>('[data-part="history-list"] [data-row-id] [role="gridcell"]')
      ?.focus();
  }, [pending, page]);
  return () => {
    const { error, history } = list.state;
    if (error === undefined && history.error === undefined) setPending(true);
  };
}
