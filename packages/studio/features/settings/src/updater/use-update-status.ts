import { useEffect, useState } from "react";
import type { UpdaterHost } from "../api.ts";
import type { UpdateStatus } from "./updater-status.ts";

/** The updater's status while the part is shown, or `null` until the shell has answered. Only reads. */
export function useUpdateStatus(host: UpdaterHost): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  useEffect(() => host.subscribe(setStatus), [host]);
  return status;
}
