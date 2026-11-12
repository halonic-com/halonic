import { Button } from "@halonicjs/studio-kit";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { OPEN_MODELS, OPEN_TRUST, WORKSPACE_LINE } from "./links-text.ts";

/** The command that opens the workspace page at Models, as Ctrl K does. */
export const openModelsCommand = "workspace.open-models";
/** The command that opens the workspace page at Trust, as Ctrl K does. */
export const openTrustCommand = "workspace.open-trust";

/** Settings → Models, as the settings container shows it. */
export function ModelsLinkSection(props: SettingsSectionProps) {
  return <LinkView {...props} button={OPEN_MODELS} command={openModelsCommand} />;
}

/** Settings → Trust, as the settings container shows it. */
export function TrustLinkSection(props: SettingsSectionProps) {
  return <LinkView {...props} button={OPEN_TRUST} command={openTrustCommand} />;
}

interface LinkViewProps extends SettingsSectionProps {
  readonly button: string;
  readonly command: string;
}

/**
 * One line and a button that closes Settings and runs a command (`settings.workspace-links`),
 * until the feature that owns the page adds its summary.
 */
function LinkView({ context, closeSettings, button, command }: LinkViewProps) {
  return (
    <div className="mt-2 flex flex-col items-start gap-4">
      <p className="text-small text-fg-muted">{WORKSPACE_LINE}</p>
      <Button
        variant="secondary"
        onClick={() => {
          closeSettings();
          context.runCommand?.(command);
        }}
      >
        {button}
      </Button>
    </div>
  );
}
