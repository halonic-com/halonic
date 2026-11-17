import { Button } from "@halonicjs/studio-kit";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { useSyncExternalStore } from "react";
import { WorkspacePageService } from "../api.ts";
import { OPEN_TRUST } from "./trust-section-text.ts";
import { StatusMark, statusLine } from "./workspace-trust-section.tsx";

/** The command that opens the workspace page at Trust, as Ctrl K does. */
const openTrustCommand = "workspace.open-trust";

/**
 * Settings → Trust (`workspace.settings-trust`): where the workspace stands ("Not trusted yet",
 * "Trusted on 17 Nov 2026"), as the workspace page's Trust section says it, and **Open Trust**, which
 * closes Settings and opens that page. Without a folder to trust it says nothing but the button.
 */
export function TrustSettingsSection({ context, closeSettings }: SettingsSectionProps) {
  const trust = context.services.get(WorkspacePageService).trust;
  const never = () => () => {};
  const status = useSyncExternalStore(trust?.subscribe.bind(trust) ?? never, () => trust?.status);
  const trustedAt = useSyncExternalStore(
    trust?.subscribe.bind(trust) ?? never,
    () => trust?.trustedAt,
  );
  return (
    <div className="mt-2 flex flex-col items-start gap-4">
      {trust === undefined || status === undefined ? null : (
        <div className="flex items-start gap-2">
          <StatusMark status={status} />
          <p className="m-0 text-small text-fg-muted">
            {statusLine(status, trustedAt, trust.failure)}
          </p>
        </div>
      )}
      <Button
        variant="secondary"
        onClick={() => {
          closeSettings();
          context.runCommand?.(openTrustCommand);
        }}
      >
        {OPEN_TRUST}
      </Button>
    </div>
  );
}
