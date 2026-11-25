import { ModelsService } from "@halonicjs/studio-feature-models/api";
import type { WorkspaceContext } from "@halonicjs/studio-shell";

/**
 * The Workspace feature's command that opens Workspace settings at Models, where the providers and
 * their keys are kept; run by id, as the Agents feature can't import it.
 */
const openModelsCommand = "workspace.open-models";

/**
 * Opens where keys are kept: with a secret name, that provider's key block through `ModelsService`
 * (**Set the key ›**, H19, models flow 3.3); without one, or where the Models feature isn't there,
 * Workspace settings at Models (**Go to the key field ›**, **Open Models ›**). Absent where the
 * window can do neither.
 */
export function keyFieldOpener(
  context: Pick<WorkspaceContext, "services" | "runCommand">,
): ((secretName?: string) => void) | undefined {
  const { services, runCommand } = context;
  if (runCommand === undefined && services.find(ModelsService) === undefined) return undefined;
  return (secretName) => {
    // Looked up on each click, as the Models feature provides it for the workspace open then.
    const models = services.find(ModelsService);
    if (secretName === undefined || models === undefined) {
      runCommand?.(openModelsCommand);
      return;
    }
    models.openProviderPage(secretName, "key");
  };
}
