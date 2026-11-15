import { Button } from "@halonicjs/studio-kit";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { useModels } from "../aliases/use-models.ts";
import { ModelsFilesService } from "../api.ts";
import { modelsSummary, OPEN_MODELS } from "./settings-text.ts";

/** The command that opens the workspace page at Models, as Ctrl K does. */
const openModelsCommand = "workspace.open-models";

/**
 * Settings → Models (`models.settings.settings-summary`): one line of what the workspace has, and
 * **Open Models**, which closes Settings and opens the workspace page.
 */
export function ModelsSettingsSection({ context, closeSettings }: SettingsSectionProps) {
  const [state] = useModels(context.services.get(ModelsFilesService));
  const line = modelsSummary(state);
  return (
    <div className="mt-2 flex flex-col items-start gap-4">
      {line === undefined ? null : <p className="text-small text-fg-muted">{line}</p>}
      <Button
        variant="secondary"
        onClick={() => {
          closeSettings();
          context.runCommand?.(openModelsCommand);
        }}
      >
        {OPEN_MODELS}
      </Button>
    </div>
  );
}
