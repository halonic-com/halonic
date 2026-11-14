import { Button, UpdateReadyIcon } from "@halonicjs/studio-kit";
import type { StatusBarItemProps } from "@halonicjs/studio-shell";
import { UpdaterService } from "../api.ts";
import { RestartFlowService, restartApplies } from "./restart-flow.ts";
import * as text from "./restart-text.ts";
import type { UpdaterHost } from "./updater-host.ts";
import { useUpdateStatus } from "./use-update-status.ts";

/**
 * The status bar's "Restart to update" (`settings.restart-item`): only while an update is ready,
 * only in a window 900px or wider, and never when another tool manages updates. It appears
 * quietly; a press opens the restart flow.
 */
export function RestartStatusItem({ context }: StatusBarItemProps) {
  const host = context.services.find(UpdaterService);
  const flow = context.services.find(RestartFlowService);
  if (host === undefined || flow === undefined) return null;
  return <ReadyItem host={host} request={() => flow.request()} />;
}

function ReadyItem({
  host,
  request,
}: {
  readonly host: UpdaterHost;
  readonly request: () => void;
}) {
  const status = useUpdateStatus(host);
  if (status === null || !restartApplies(status) || status.state.kind !== "ready") return null;
  return (
    <span className="hidden wide:contents">
      <Button variant="ghost" size="sm" icon={<UpdateReadyIcon />} onClick={request}>
        <span aria-hidden="true">{text.RESTART_TO_UPDATE}</span>
        <span className="sr-only">{text.itemName(status.state.version)}</span>
      </Button>
    </span>
  );
}
