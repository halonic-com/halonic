import type { Plugin } from "@halonicjs/format";
import { useState } from "react";
import { messageOf } from "../message-of.ts";
import { changeSummary } from "../trust/change-rows.ts";
import { PluginTrustDialog } from "../trust/plugin-trust-dialog.tsx";
import { trustedDay } from "./page-text.ts";
import type { PluginActions } from "./plugin-actions.ts";
import type { InstalledPlugin } from "./plugin-pages.ts";

/** The props of `ReviewPluginDialog`. */
export interface ReviewPluginDialogProps {
  readonly plugin: InstalledPlugin;
  readonly manifest: Plugin;
  readonly trust: PluginActions["trust"];
  /** After **Trust** is saved, and on **Not now** and Escape. */
  readonly onClose: () => void;
}

/**
 * The trust check opened from **Review** on a plugin's page (design section 5, checklist 4):
 * **Trust** saves trust through the app and closes the dialog, so the status box then says the
 * plugin is on. When it can't be saved, the dialog stays open and says why; **Not now** leaves
 * the plugin as it was.
 *
 * @example
 * <ReviewPluginDialog plugin={weather} manifest={manifest} trust={actions.trust}
 *   onClose={() => setReviewing(false)} />
 */
export function ReviewPluginDialog({ plugin, manifest, trust, onClose }: ReviewPluginDialogProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);

  async function confirm() {
    setBusy(true);
    setFailure(undefined);
    try {
      await trust(plugin.plugin);
      onClose();
      return;
    } catch (error) {
      setFailure(messageOf(error));
    }
    setBusy(false);
  }

  const changes = plugin.status === "changed" ? plugin.changes : undefined;
  return (
    <PluginTrustDialog
      manifest={manifest}
      origin={plugin.origin}
      reason={changes !== undefined ? "changed" : "review"}
      changes={changes !== undefined ? changeSummary(manifest, changes) : undefined}
      trustedOn={trustedDay(plugin.trustedAt, new Date())}
      busy={busy}
      failure={failure}
      onTrust={() => void confirm()}
      onNotNow={onClose}
    />
  );
}
