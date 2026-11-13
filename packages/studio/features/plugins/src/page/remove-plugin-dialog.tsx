import { Dialog } from "@halonicjs/studio-kit";
import { useState } from "react";
import { messageOf } from "../message-of.ts";
import {
  actionFailedLine,
  goesAwayLine,
  type PluginActions,
  REMOVE_PLUGIN,
  REMOVING,
  removedFromComputerLine,
  removeFailedLine,
  removeTitle,
} from "./plugin-actions.ts";
import type { InstalledPlugin } from "./plugin-pages.ts";

/** The props of `RemovePluginDialog`. */
export interface RemovePluginDialogProps {
  readonly plugin: InstalledPlugin;
  readonly remove: PluginActions["remove"];
  /** After it's removed: the page says so in a toast. */
  readonly onRemoved: () => void;
  readonly onCancel: () => void;
}

/**
 * "Remove *name*?" (T13, F18, checklist 6.5): the kit Dialog sm, **Cancel** focused, **Remove
 * plugin** in `danger`. It names only what the plugin adds and keeps (G8). The connector sentence
 * is left out until Studio knows which connectors use a plugin (G4). When a secret can't be
 * deleted, it stays open and says which; pressing **Remove plugin** again finishes the job.
 *
 * @example
 * <RemovePluginDialog plugin={weather} remove={actions.remove}
 *   onRemoved={() => toast("Weather removed")} onCancel={close} />
 */
export function RemovePluginDialog({
  plugin,
  remove,
  onRemoved,
  onCancel,
}: RemovePluginDialogProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const keeps = removedFromComputerLine(plugin.manifest);

  async function confirm() {
    setBusy(true);
    setFailure(undefined);
    try {
      const outcome = await remove(plugin.plugin);
      if (outcome.kind === "removed") {
        onRemoved();
        return;
      }
      setFailure(removeFailedLine(plugin.name, outcome.secret, outcome.reason));
    } catch (error) {
      setFailure(actionFailedLine(`remove ${plugin.name}`, messageOf(error)));
    }
    setBusy(false);
  }

  return (
    <Dialog
      title={removeTitle(plugin.name)}
      confirm={{ label: REMOVE_PLUGIN, variant: "danger", busyLabel: REMOVING }}
      busy={busy}
      {...(failure === undefined ? {} : { error: failure })}
      onConfirm={() => void confirm()}
      onCancel={onCancel}
    >
      <p>{goesAwayLine(plugin.manifest)}</p>
      {keeps === "" ? null : <p className="mt-2">{keeps}</p>}
    </Dialog>
  );
}
