import { type RefObject, useEffect, useRef } from "react";
import type { CloseStack } from "../close-stack/close-stack.ts";

/**
 * Registers a maximised panel with the window's close stack as a `maximise` layer, so Esc puts it
 * back beside the chat once dialogs, menus and cards above it have closed. It counts only while its
 * page is shown, since the last five tabs' pages stay mounted. `restore` is kept in a ref, so a new
 * function each render doesn't register the layer again.
 */
export function useMaximiseLayer(
  maximised: boolean,
  closeStack: CloseStack | undefined,
  page: RefObject<HTMLElement | null>,
  restore: () => void,
): void {
  const latestRestore = useRef(restore);
  latestRestore.current = restore;

  useEffect(() => {
    if (!maximised || closeStack === undefined) {
      return;
    }
    return closeStack.open({
      kind: "maximise",
      close: () => {
        latestRestore.current();
        return true;
      },
      isActive: () => page.current?.closest("[hidden], [inert]") === null,
    });
  }, [maximised, closeStack, page]);
}
