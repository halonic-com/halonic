import type { RunnerUnfencedReason } from "@halonicjs/app";
import { useState } from "react";
import { messageOf } from "../message-of.ts";
import { changeSummary } from "../trust/change-rows.ts";
import { PluginTrustDialog } from "../trust/plugin-trust-dialog.tsx";
import type { ProgramsRun } from "../trust/trust-text.ts";
import { type PluginUnfencedRuns, trustWithYes, useTrustStatus } from "../trust/unfenced-status.ts";
import type { PluginActions, PluginUpdateCheck } from "./plugin-actions.ts";
import type { InstalledPlugin } from "./plugin-pages.ts";

/** The props of `UpdatePluginDialog`. */
export interface UpdatePluginDialogProps {
  readonly plugin: InstalledPlugin;
  /** What the check found: the newer version. */
  readonly found: Extract<PluginUpdateCheck, { kind: "available" }>;
  readonly applyUpdate: NonNullable<PluginActions["applyUpdate"]>;
  readonly programsRun?: ProgramsRun;
  /** The host's sandbox status and saved yes, read when the check opens; without it, T9. */
  readonly unfencedRuns?: PluginUnfencedRuns | undefined;
  /** After **Trust and update** is saved. */
  readonly onUpdated: () => void;
  /** **Keep** *version* and Escape: everything stays as it was. */
  readonly onKeep: () => void;
}

/**
 * "Update *name* to *version*?" (design section 6, T6 and T10): the trust check for the newer
 * version, with the change rows against what the person trusted. **Keep** *version* is focused and
 * leaves everything as it was; **Trust and update** puts the newer version in place and trusts it.
 * When that can't be saved, the dialog stays open and says why, and the old version stays.
 *
 * @example
 * <UpdatePluginDialog plugin={weather} found={found} applyUpdate={actions.applyUpdate}
 *   onUpdated={close} onKeep={close} />
 */
export function UpdatePluginDialog({
  plugin,
  found,
  applyUpdate,
  programsRun,
  unfencedRuns,
  onUpdated,
  onKeep,
}: UpdatePluginDialogProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const status = useTrustStatus(unfencedRuns);

  async function confirm(allow: RunnerUnfencedReason | undefined) {
    setBusy(true);
    setFailure(undefined);
    try {
      const approved = { version: found.manifest.version, toCommit: found.toCommit };
      if (
        await trustWithYes(allow, unfencedRuns, status, () => applyUpdate(plugin.plugin, approved))
      ) {
        onUpdated();
        return;
      }
    } catch (error) {
      setFailure(messageOf(error));
    }
    setBusy(false);
  }

  return (
    <PluginTrustDialog
      manifest={found.manifest}
      origin={plugin.origin}
      reason="update"
      changes={
        found.changes === undefined ? undefined : changeSummary(found.manifest, found.changes)
      }
      update={{ keep: plugin.manifest?.version ?? "", toCommit: found.toCommit }}
      programsRun={programsRun}
      fence={status.fence}
      unfencedYes={status.yes}
      busy={busy}
      failure={failure}
      onTrust={(allow) => void confirm(allow)}
      onNotNow={onKeep}
    />
  );
}
