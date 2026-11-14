import { Dialog } from "@halonicjs/studio-kit";
import { useEffect, useId, useState } from "react";
import { messageOf } from "../message-of.ts";
import {
  actionFailedLine,
  CHECKING_USED_BY,
  goesAwayLine,
  type PluginActions,
  type PluginUse,
  REMOVE_PLUGIN,
  REMOVING,
  removedFromComputerLine,
  removeFailedLine,
  removeTitle,
  stopsWorkingLine,
  USED_BY_UNKNOWN,
} from "./plugin-actions.ts";
import type { InstalledPlugin } from "./plugin-pages.ts";

/** The props of `RemovePluginDialog`. */
export interface RemovePluginDialogProps {
  readonly plugin: InstalledPlugin;
  readonly remove: PluginActions["remove"];
  readonly usedBy: PluginActions["usedBy"];
  /** After it's removed: the page says so in a toast. */
  readonly onRemoved: () => void;
  readonly onCancel: () => void;
}

/**
 * "Remove *name*?" (T13, F18, checklist 6.5): the kit Dialog sm, **Cancel** focused, **Remove
 * plugin** in `danger`. It names only what the plugin adds and keeps (G8). The connector sentence
 * is added when a connector uses the plugin, in any workspace on this computer (G4); if Halonic
 * can't tell, the dialog says so. **Remove plugin** stays unavailable until that check has answered,
 * so the warning is never skipped. When a secret can't be deleted, it stays open and says which;
 * pressing **Remove plugin** again finishes the job.
 *
 * @example
 * <RemovePluginDialog plugin={weather} remove={actions.remove}
 *   usedBy={actions.usedBy} onRemoved={() => toast("Weather removed")} onCancel={close} />
 */
export function RemovePluginDialog({
  plugin,
  remove,
  usedBy,
  onRemoved,
  onCancel,
}: RemovePluginDialogProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const checking = useId();
  const keeps = removedFromComputerLine(plugin.manifest);
  const [uses, setUses] = useState<readonly PluginUse[] | "unknown" | undefined>(undefined);

  useEffect(() => {
    let current = true;
    usedBy(plugin.plugin).then(
      (found) => {
        if (current) setUses(found);
      },
      () => {
        if (current) setUses("unknown");
      },
    );
    return () => {
      current = false;
    };
  }, [plugin.plugin, usedBy]);

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
      confirm={{
        label: REMOVE_PLUGIN,
        variant: "danger",
        busyLabel: REMOVING,
        ...(uses === undefined ? { unavailable: { reason: checking } } : {}),
      }}
      busy={busy}
      {...(failure === undefined ? {} : { error: failure })}
      onConfirm={() => void confirm()}
      onCancel={onCancel}
    >
      <p>
        {goesAwayLine(plugin.manifest)}
        {uses === undefined
          ? null
          : ` ${uses === "unknown" ? USED_BY_UNKNOWN : stopsWorkingLine(uses)}`.trimEnd()}
      </p>
      {uses === undefined ? (
        <p id={checking} className="mt-2">
          {CHECKING_USED_BY}
        </p>
      ) : null}
      {keeps === "" ? null : <p className="mt-2">{keeps}</p>}
    </Dialog>
  );
}
