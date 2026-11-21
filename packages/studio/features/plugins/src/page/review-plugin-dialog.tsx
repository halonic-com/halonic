import type { RunnerUnfencedReason } from "@halonicjs/app";
import type { Plugin } from "@halonicjs/format";
import { useState } from "react";
import { changeSummary } from "../trust/change-rows.ts";
import { PluginTrustDialog } from "../trust/plugin-trust-dialog.tsx";
import type { ProgramsRun, TrustCheckReason } from "../trust/trust-text.ts";
import {
  type PluginUnfencedRuns,
  trustFailureOf,
  trustWithYes,
  useTrustStatus,
} from "../trust/unfenced-status.ts";
import { trustedDay } from "./page-text.ts";
import type { PluginActions } from "./plugin-actions.ts";
import type { InstalledPlugin } from "./plugin-pages.ts";

/** The props of `ReviewPluginDialog`. */
export interface ReviewPluginDialogProps {
  readonly plugin: InstalledPlugin;
  readonly manifest: Plugin;
  readonly trust: PluginActions["trust"];
  readonly programsRun?: ProgramsRun;
  /** The host's sandbox status and saved yes, read when the check opens; without it, T9. */
  readonly unfencedRuns?: PluginUnfencedRuns | undefined;
  /** After **Trust** is saved, and on **Not now** and Escape. */
  readonly onClose: () => void;
  /** After **Trust** is saved, before `onClose`: the page says "*name* is on" in a toast. */
  readonly onTrusted?: () => void;
  /** Where focus goes when the opener is gone (**Review** leaves once the plugin is on). */
  readonly returnFocus?: () => HTMLElement | null;
  /** The plugin was just added: "Trust *name* and turn it on?" with **Trust and turn on**. */
  readonly added?: boolean;
  /** **Not now** and Escape, when they do something other than `onClose`. */
  readonly onNotNow?: () => void;
}

/**
 * The trust check opened from **Review** on a plugin's page (design section 5, checklist 4):
 * **Trust** saves trust through the app and closes the dialog, so the status box then says the
 * plugin is on. With the box ticked, it saves the yes to run without the sandbox first, and trusts
 * only once that's saved. When it can't be saved, the dialog stays open and says why; **Not now** leaves
 * the plugin as it was.
 *
 * @example
 * <ReviewPluginDialog plugin={weather} manifest={manifest} trust={actions.trust}
 *   onClose={() => setReviewing(false)} />
 */
export function ReviewPluginDialog({
  plugin,
  manifest,
  trust,
  programsRun,
  unfencedRuns,
  onClose,
  onTrusted,
  returnFocus,
  added = false,
  onNotNow,
}: ReviewPluginDialogProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const status = useTrustStatus(unfencedRuns);

  async function confirm(allow: RunnerUnfencedReason | undefined) {
    setBusy(true);
    setFailure(undefined);
    try {
      if (await trustWithYes(allow, unfencedRuns, status, () => trust(plugin.plugin))) {
        onTrusted?.();
        onClose();
        return;
      }
    } catch (error) {
      setFailure(trustFailureOf(error));
    }
    setBusy(false);
  }

  const changes = plugin.status === "changed" ? plugin.changes : undefined;
  let reason: TrustCheckReason = "review";
  if (changes !== undefined) reason = "changed";
  else if (added) reason = "add";
  return (
    <PluginTrustDialog
      manifest={manifest}
      origin={plugin.origin}
      reason={reason}
      folder={plugin.location}
      files={plugin.backendFiles}
      changes={changes !== undefined ? changeSummary(manifest, changes) : undefined}
      trustedOn={trustedDay(plugin.trustedAt, new Date())}
      programsRun={programsRun}
      fence={status.fence}
      unfencedYes={status.yes}
      busy={busy}
      failure={failure}
      onTrust={(allow) => void confirm(allow)}
      onNotNow={onNotNow ?? onClose}
      returnFocus={returnFocus}
    />
  );
}
