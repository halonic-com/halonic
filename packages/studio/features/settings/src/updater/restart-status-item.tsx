import { Button, Tooltip, UpdateReadyIcon } from "@halonicjs/studio-kit";
import type { StatusBarItemProps } from "@halonicjs/studio-shell";
import { UpdaterService } from "../api.ts";
import { RestartFlowService, restartApplies } from "./restart-flow.ts";
import * as text from "./restart-text.ts";
import type { UpdaterHost } from "./updater-host.ts";
import { useUpdateStatus } from "./use-update-status.ts";

/**
 * The status bar's "Restart to update" (`settings.restart-item`): only while an update is ready,
 * only in a window 900px or wider, and never when another tool manages updates. It appears
 * quietly; a press opens the restart flow. When Scoop manages updates and has a newer version,
 * the item instead says to run its command, and a press opens About Halonic.
 */
export function RestartStatusItem({ context }: StatusBarItemProps) {
  const host = context.services.find(UpdaterService);
  const flow = context.services.find(RestartFlowService);
  if (host === undefined || flow === undefined) return null;
  return (
    <UpdateItem
      host={host}
      request={() => flow.request()}
      openAbout={() => context.openSettings?.("about")}
    />
  );
}

function UpdateItem({
  host,
  request,
  openAbout,
}: {
  readonly host: UpdaterHost;
  readonly request: () => void;
  readonly openAbout: () => void;
}) {
  const status = useUpdateStatus(host);
  if (status === null) return null;
  if (status.managed !== null && status.state.kind === "available") {
    return (
      <ManagedItem
        version={status.state.version}
        command={status.managed.command}
        openAbout={openAbout}
      />
    );
  }
  if (!restartApplies(status)) return null;
  return (
    <span className="hidden wide:contents">
      <Button variant="ghost" size="sm" icon={<UpdateReadyIcon />} onClick={request}>
        <span aria-hidden="true">{text.RESTART_TO_UPDATE}</span>
        <span className="sr-only">{text.itemName(status.state.version)}</span>
      </Button>
    </span>
  );
}

/** From 900px the short words with the full line as a tooltip; from 1200px the full line. */
function ManagedItem({
  version,
  command,
  openAbout,
}: {
  readonly version: string;
  readonly command: string;
  readonly openAbout: () => void;
}) {
  return (
    <span className="hidden wide:contents">
      <Tooltip text={text.managedLine(command)}>
        {(trigger) => (
          <Button
            variant="ghost"
            size="sm"
            icon={<UpdateReadyIcon />}
            onClick={openAbout}
            {...trigger}
          >
            <span aria-hidden="true" className="min-[1200px]:hidden">
              {text.MANAGED_SHORT}
            </span>
            <span aria-hidden="true" className="hidden min-[1200px]:inline">
              {text.MANAGED_RUN}
              <code className="font-mono">{command}</code>.
            </span>
            <span className="sr-only">{text.managedItemName(version, command)}</span>
          </Button>
        )}
      </Tooltip>
    </span>
  );
}
