import { Button, StatusChip } from "@halonicjs/studio-kit";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { useModels } from "../aliases/use-models.ts";
import { ModelsFilesService } from "../api.ts";
import { BUDGET_USED_UP } from "./problems.ts";
import { OPEN_MODELS } from "./settings-text.ts";
import { useProblems } from "./use-problems.ts";

/** The command that opens the workspace page at Models, as Ctrl K does. */
const openModelsCommand = "workspace.open-models";

/**
 * Settings → Models (`models.settings.settings-summary`): one line of what the workspace has, the
 * chips of what needs a look ("Budget used up", "No key for Anthropic"; `models.settings.problems`),
 * and **Open Models**, which closes Settings and opens the workspace page.
 */
export function ModelsSettingsSection({ context, closeSettings }: SettingsSectionProps) {
  const [state] = useModels(context.services.get(ModelsFilesService));
  const chips = useProblems(context, state);
  return (
    <div className="flex flex-col items-start gap-4">
      {chips.length === 0 ? null : (
        <ul className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <li key={chip}>
              <StatusChip tone={chip === BUDGET_USED_UP ? "attention" : "warning"}>
                {chip}
              </StatusChip>
            </li>
          ))}
        </ul>
      )}
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
