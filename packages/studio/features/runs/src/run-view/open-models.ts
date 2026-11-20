import type { WorkspaceContext } from "@halonicjs/studio-shell";

/** The command that opens the workspace page at Models (`features/workspace`). */
const openModelsCommand = "workspace.open-models";
/** The item kind of a model alias's tab (`features/models`). */
const modelAliasKind = "model-alias";

/**
 * **Open Models** on a failed banner: the alias's tab when the banner names one and the window can
 * open tabs (15.3, "the alias `fast`'s tab"), else the workspace page at Models. `undefined` where
 * the window can't open Models, and the button isn't there.
 */
export function openModelsOf(
  context: Pick<WorkspaceContext, "runCommand" | "openItem">,
): ((alias?: string) => void) | undefined {
  const { runCommand, openItem } = context;
  if (runCommand === undefined) {
    return undefined;
  }
  return (alias) => {
    if (alias !== undefined && openItem !== undefined) {
      openItem({ kind: modelAliasKind, hub: "local", id: alias });
      return;
    }
    runCommand(openModelsCommand);
  };
}
