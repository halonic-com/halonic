import { Button } from "@halonicjs/studio-kit";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { useCallback, useSyncExternalStore } from "react";
import { WorkspacePageService } from "../api.ts";
import { OPEN_TRUST } from "./trust-section-text.ts";
import { holdsNothingToTrust } from "./trust-summary.ts";
import { StatusMark, statusLine } from "./workspace-trust-section.tsx";

/** The command that opens the workspace page at Trust, as Ctrl K does. */
const openTrustCommand = "workspace.open-trust";

/**
 * Settings → Trust (`workspace.settings-trust`): where the workspace stands ("Not trusted yet",
 * "Trusted on 17 Nov 2026"), as the workspace page's Trust section says it, and **Open Trust**, which
 * closes Settings and opens that page. Without a folder to trust it says nothing but the button;
 * a workspace that holds nothing to trust says so and has no button, as the page has no **Review**.
 */
export function TrustSettingsSection({ context, closeSettings }: SettingsSectionProps) {
  const trust = context.services.get(WorkspacePageService).trust;
  const subscribe = useCallback(
    (onChange: () => void) => trust?.subscribe(onChange) ?? (() => {}),
    [trust],
  );
  const status = useSyncExternalStore(subscribe, () => trust?.status);
  const trustedAt = useSyncExternalStore(subscribe, () => trust?.trustedAt);
  const needsNoTrust = useSyncExternalStore(subscribe, () => trust?.needsNoTrust);
  const nothingToTrust = status !== undefined && holdsNothingToTrust(status, needsNoTrust);
  return (
    <div className="mt-2 flex flex-col items-start gap-4">
      {trust === undefined || status === undefined ? null : (
        <div className="flex items-start gap-2">
          <StatusMark status={status} />
          <p className="m-0 text-small text-fg-muted">{statusLine(status, trustedAt, trust)}</p>
        </div>
      )}
      {nothingToTrust ? null : (
        <Button
          variant="secondary"
          onClick={() => {
            closeSettings();
            context.runCommand?.(openTrustCommand);
          }}
        >
          {OPEN_TRUST}
        </Button>
      )}
    </div>
  );
}
