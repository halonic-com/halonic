import { Button, Tooltip, UpdateReadyIcon } from "@halonicjs/studio-kit";
import type { StatusBarItemProps } from "@halonicjs/studio-shell";
import { UpdaterService } from "../api.ts";
import * as text from "./restart-text.ts";
import type { UpdaterHost } from "./updater-host.ts";
import { useUpdateStatus } from "./use-update-status.ts";

/**
 * The status bar's update item (`settings.restart-item`): only when Scoop manages updates and has
 * a newer version, only in a window 900px or wider. It says to run Scoop's command, and a press
 * opens About Halonic. An update Studio installs itself has no item here: the title bar's
 * **Update** is its one way in (HAL-19579), so a ready update doesn't show two buttons.
 */
export function RestartStatusItem({ context }: StatusBarItemProps) {
  const host = context.services.find(UpdaterService);
  if (host === undefined) return null;
  return <UpdateItem host={host} openAbout={() => context.openSettings?.("about")} />;
}

function UpdateItem({
  host,
  openAbout,
}: {
  readonly host: UpdaterHost;
  readonly openAbout: () => void;
}) {
  const status = useUpdateStatus(host);
  if (status === null) return null;
  if (status.managed === null || status.state.kind !== "available") return null;
  return (
    <ManagedItem
      version={status.state.version}
      command={status.managed.command}
      openAbout={openAbout}
    />
  );
}

/** The tooltip is for the short words only: from 1200px the full line is already on screen. */
const isNarrowManaged = () => !window.matchMedia("(min-width: 1200px)").matches;

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
      <Tooltip text={text.managedLine(command)} isName showIf={isNarrowManaged}>
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
