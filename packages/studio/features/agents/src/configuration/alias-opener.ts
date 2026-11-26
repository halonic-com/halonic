import { ModelsService } from "@halonicjs/studio-feature-models/api";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import type { OpenAlias } from "./alias-line.tsx";

/**
 * Opens an alias's tab on Models through `ModelsService`, for the line under the Model page's
 * picker; absent where the Models feature isn't there, which leaves the alias's name as text.
 */
export function aliasOpener(context: Pick<WorkspaceContext, "services">): OpenAlias | undefined {
  const { services } = context;
  if (services.find(ModelsService) === undefined) return undefined;
  // Looked up on each click, as the Models feature provides it for the workspace open then.
  return (name, options) => services.find(ModelsService)?.openAlias(name, options);
}
