import type { DialogHostProps } from "@halonicjs/studio-shell";
import { useCallback, useSyncExternalStore } from "react";
import { KeyAddressQueueService } from "./key-address-service.ts";
import { AllowAddressDialog } from "./allow-address-dialog.tsx";

/**
 * The feature's dialog host: draws the first waiting "Allow this address?" over whatever page is
 * open. The buttons only answer the question; the engine saves the address it was refused.
 */
export function AllowAddressDialogHost({ context }: DialogHostProps) {
  const queue = context.services.get(KeyAddressQueueService);
  const subscribe = useCallback((listener: () => void) => queue.subscribe(listener), [queue]);
  const shown = useSyncExternalStore(subscribe, () => queue.shown);
  if (shown === undefined) return null;
  return (
    <AllowAddressDialog
      // A new question is a new dialog, so focus starts on Don't allow again.
      key={shown.id}
      shown={shown}
      onAllow={() => void queue.allow()}
      onRefuse={() => queue.refuse()}
    />
  );
}
