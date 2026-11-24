import type { DialogHostProps } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { PageRequestsService } from "./page-requests.ts";

/**
 * Opens the pages `ModelsService` asked for, with this window's `openItem`. It draws nothing: it
 * is added as a dialog host only because that is the one place each window draws once, with the
 * feature's context, whatever page shows.
 */
export function PageOpenerHost({ context }: DialogHostProps) {
  const requests = context.services.get(PageRequestsService);
  const subscribe = useCallback((listener: () => void) => requests.subscribe(listener), [requests]);
  const waiting = useSyncExternalStore(subscribe, requests.waiting);
  useEffect(() => {
    if (waiting.length === 0) return;
    for (const request of requests.take()) {
      if (request.open === "item") context.openItem?.(request.item, request.options);
      else context.runCommand?.(request.commandId);
    }
  }, [waiting, requests, context]);
  return null;
}
